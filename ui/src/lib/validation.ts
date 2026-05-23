/**
 * Shared form validators that mirror backend Pydantic rules so dialogs can
 * surface errors locally before round-tripping to a 422.
 *
 * Keep this in sync with ``api/src/aerospike_cluster_manager_api/models/record.py``
 * (``BinName`` alias + ``_validate_bin_names`` helper) and the ``BinName``
 * users in ``models/query.py`` / ``models/index.py``.
 */

export const MAX_BIN_NAME_LENGTH = 15

/**
 * Validate an Aerospike bin name against the same rules the backend enforces:
 * length 1..15, no ASCII control characters (0x00..0x1F + 0x7F), no
 * leading/trailing whitespace. Returns ``null`` on success or a
 * human-readable error message on failure.
 */
export function validateBinName(name: string): string | null {
  if (name.length === 0) return "Bin name is required."
  if (name.length > MAX_BIN_NAME_LENGTH) {
    return `Bin name must be at most ${MAX_BIN_NAME_LENGTH} characters.`
  }
  if (name !== name.trim()) {
    return "Bin name must not have leading or trailing whitespace."
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return "Bin name must not contain control characters."
    }
  }
  return null
}
