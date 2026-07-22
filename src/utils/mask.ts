/**
 * Render a secret for display without revealing it. We keep a short prefix and
 * suffix so a user can recognize *which* key is stored, but never enough to
 * reconstruct or leak it. Short secrets are fully masked.
 */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}
