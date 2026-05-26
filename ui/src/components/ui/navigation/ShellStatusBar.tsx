"use client"

import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"

type Health = "healthy" | "degraded" | "unreach"

/**
 * Bottom status bar — 28px tall, fixed across the right of the sidebar.
 * Connection / connections count / health dots / version / docs link.
 *
 * Uses the `.status-dot is-*` + `.statusbar` classes from src/styles/theme.css.
 */
export function ShellStatusBar() {
  const conn = useConnections()
  const k8s = useK8sClusters()

  const connected = !(conn.error || k8s.error)
  const connectionsCount = conn.data?.length ?? 0

  const services: { name: string; status: Health }[] = [
    { name: "api", status: connected ? "healthy" : "unreach" },
    { name: "acko", status: k8s.error ? "unreach" : "healthy" },
    {
      name: "k8s",
      status: k8s.data?.items?.length ? "healthy" : "degraded",
    },
  ]

  return (
    <div className="acm-statusbar statusbar">
      <span className="seg">
        <span
          className={`status-dot is-${connected ? "succeeded" : "failed"}`}
          aria-label={connected ? "connected" : "disconnected"}
        />
        <span>{connected ? "connected" : "disconnected"}</span>
      </span>
      <span className="seg">
        connections <b>{connectionsCount}</b>
      </span>
      <span className="seg" style={{ display: "inline-flex", gap: 8 }}>
        {services.map((s) => (
          <span
            key={s.name}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span
              className={`status-dot is-${s.status}`}
              aria-label={s.status}
            />
            <span
              style={{
                fontSize: 10,
                color:
                  s.status === "healthy"
                    ? "var(--on-surface-variant)"
                    : "var(--error-55)",
              }}
            >
              {s.name}
            </span>
          </span>
        ))}
      </span>
      <span style={{ flex: 1 }} />
      <span className="seg">acm v0.1.0</span>
      <a
        className="seg"
        href="https://github.com/aerospike-ce-ecosystem/aerospike-cluster-manager"
        target="_blank"
        rel="noreferrer"
      >
        ↗ docs
      </a>
    </div>
  )
}
