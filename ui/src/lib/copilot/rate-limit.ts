/**
 * Fixed-window rate limiting for `/copilotkit` (#472).
 *
 * The FastAPI side is covered by slowapi, but slowapi is installed on the
 * FastAPI app only — no Next.js route handler participates in it. `/copilotkit`
 * therefore had no limit of any kind, on a path whose per-request cost is an
 * LLM call against the operator's provider key.
 *
 * Two budgets, because they answer different questions:
 *
 * - **per-key** — fairness. Keyed on the first `X-Forwarded-For` hop, so one
 *   busy tab cannot starve the rest of the team.
 * - **global** — the cost ceiling. This is the one that actually bounds spend,
 *   and it is deliberately not skippable: the per-key bucket is only as
 *   trustworthy as the header it is keyed on, and until `proxy.js` overwrites
 *   inbound `X-Forwarded-For` (#473) a caller can rotate the header to mint
 *   fresh per-key buckets at will. The global budget does not care.
 *
 * In-process and per-replica by design. A shared store (Redis) would be the
 * right answer for a multi-replica deployment, but that is infrastructure this
 * project does not otherwise require, and a per-replica ceiling of N still
 * bounds total spend at N × replicas rather than at infinity.
 */

const WINDOW_MS = 60_000

const DEFAULT_PER_KEY_LIMIT = 60
const DEFAULT_GLOBAL_LIMIT = 300

/**
 * Cap on distinct keys tracked at once. Without it the map is an unbounded
 * allocation driven by an attacker-chosen header.
 */
const MAX_TRACKED_KEYS = 10_000

function readLimit(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  // A malformed or non-positive value must not silently disable the limit.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Read live rather than at module load, so a test can stub the env. */
export function copilotRateLimits(): {
  perKeyPerMinute: number
  globalPerMinute: number
} {
  return {
    perKeyPerMinute: readLimit(
      "COPILOT_RATE_LIMIT_PER_MINUTE",
      DEFAULT_PER_KEY_LIMIT,
    ),
    globalPerMinute: readLimit(
      "COPILOT_GLOBAL_RATE_LIMIT_PER_MINUTE",
      DEFAULT_GLOBAL_LIMIT,
    ),
  }
}

interface Bucket {
  count: number
  resetAt: number
}

const perKey = new Map<string, Bucket>()
let globalBucket: Bucket = { count: 0, resetAt: 0 }

/** Test seam: forget every counter. */
export function resetCopilotRateLimit(): void {
  perKey.clear()
  globalBucket = { count: 0, resetAt: 0 }
}

/**
 * Derive the rate-limit key for a request.
 *
 * The leftmost `X-Forwarded-For` hop is the conventional client address. It is
 * only as trustworthy as the proxy in front — see the module docstring — which
 * is why the global budget exists alongside it. Requests with no header share
 * one bucket, which is the correct conservative answer: unattributable traffic
 * should not each get its own allowance.
 */
export function copilotRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  return realIp || "unattributed"
}

/** Seconds until `bucket` rolls over, floored at 1 so `Retry-After` is useful. */
function retryAfter(bucket: Bucket, now: number): number {
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
}

/** True when `bucket` has room, rolling the window over if it has expired. */
function hasRoom(bucket: Bucket, limit: number, now: number): boolean {
  if (now >= bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + WINDOW_MS
  }
  return bucket.count < limit
}

/**
 * Charge one request against both budgets.
 *
 * Returns `null` when the request may proceed, or the number of seconds until
 * the exhausted window rolls over (for `Retry-After`).
 *
 * Both budgets are *checked* before either is *charged*. Charging as we go
 * would mean a caller rejected by their own bucket had still consumed global
 * headroom — so hammering one key would exhaust everyone's budget without a
 * single request ever reaching the LLM.
 */
export function checkCopilotRateLimit(
  key: string,
  now = Date.now(),
): number | null {
  const { perKeyPerMinute, globalPerMinute } = copilotRateLimits()

  let bucket = perKey.get(key)
  if (!bucket) {
    // Prune expired entries before deciding the map is full, so a long-running
    // process does not wedge at the cap on churned keys.
    if (perKey.size >= MAX_TRACKED_KEYS) {
      for (const [k, b] of perKey) {
        if (now >= b.resetAt) perKey.delete(k)
      }
    }
    if (perKey.size < MAX_TRACKED_KEYS) {
      bucket = { count: 0, resetAt: 0 }
      perKey.set(key, bucket)
    }
    // Still full: fall through with no per-key bucket. The global budget below
    // still bounds this request, and it is the budget that matters for spend.
    // Denying instead would let a key flood lock out legitimate users.
  }

  if (!hasRoom(globalBucket, globalPerMinute, now)) {
    return retryAfter(globalBucket, now)
  }
  if (bucket && !hasRoom(bucket, perKeyPerMinute, now)) {
    return retryAfter(bucket, now)
  }

  globalBucket.count += 1
  if (bucket) bucket.count += 1
  return null
}
