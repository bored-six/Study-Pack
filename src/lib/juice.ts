/**
 * Juice traffic control. The exam has enough delight that moments can
 * collide — a stamp slamming while a flare leaps while a star sparkles
 * reads as noise. Effects note when they fire; competing effects check
 * before firing, so each moment lands alone.
 */
const last: Record<string, number> = {};

export function markJuice(kind: string): void {
  last[kind] = Date.now();
}

export function msSinceJuice(kind: string): number {
  const at = last[kind];
  return at == null ? Number.POSITIVE_INFINITY : Date.now() - at;
}
