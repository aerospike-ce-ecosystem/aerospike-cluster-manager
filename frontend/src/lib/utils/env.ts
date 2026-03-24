/**
 * Helpers to convert between the backend env-var format [{name, value}]
 * and the flat Record<string, string> expected by KeyValueEditor.
 */

/** Convert [{name: "FOO", value: "bar"}] to {FOO: "bar"} for KeyValueEditor. */
export function envArrayToRecord(
  arr: Record<string, string>[] | undefined,
): Record<string, string> | undefined {
  if (!arr || arr.length === 0) return undefined;
  const rec: Record<string, string> = {};
  for (const entry of arr) {
    if (entry.name) rec[entry.name] = entry.value ?? "";
  }
  return Object.keys(rec).length > 0 ? rec : undefined;
}

/** Convert {FOO: "bar"} to [{name: "FOO", value: "bar"}] for backend format. */
export function recordToEnvArray(
  rec: Record<string, string> | undefined,
): Record<string, string>[] | undefined {
  if (!rec || Object.keys(rec).length === 0) return undefined;
  return Object.entries(rec).map(([name, value]) => ({ name, value }));
}
