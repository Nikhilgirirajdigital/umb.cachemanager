import type { ExpiryKind } from "../api/types";

/** Milliseconds until `expiresAt`, or null when there is no instant to count down to. */
export function remainingMs(
  expiresAt: string | null | undefined,
  now: number
): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? null : at - now;
}

/**
 * Renders the remaining time for display. "never" and "—" are different answers:
 * the entry has no expiry, versus we could not determine one.
 */
export function formatRemaining(msRemaining: number | null, kind: ExpiryKind): string {
  if (kind === "none") return "never";
  if (kind === "unknown" || msRemaining === null) return "—";
  // Entries are evicted lazily, so an expired entry can legitimately still be listed.
  if (msRemaining <= 0) return "expired";

  const totalSeconds = Math.floor(msRemaining / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return `${totalHours}h ${minutes}m`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

/** True when the entry is about to go — drives the warning colour. */
export function isExpiringSoon(msRemaining: number | null, kind: ExpiryKind): boolean {
  if (kind === "none" || kind === "unknown" || msRemaining === null) return false;
  return msRemaining > 0 && msRemaining < 60_000;
}
