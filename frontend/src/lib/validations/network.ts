/** CIDR validation with octet and prefix range checks (e.g. 10.0.0.0/8). */
export function isValidCIDR(v: string): boolean {
  const match = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  const prefix = Number(match[5]);
  return octets.every((o) => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32;
}
