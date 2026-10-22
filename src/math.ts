export interface Vec2 {
  x: number;
  y: number;
}

export function norm(x: number, y: number): Vec2 {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Cheap approximately-normal random number (mean 0, sd ~1). */
export function gauss(rng: () => number = Math.random): number {
  return (rng() + rng() + rng() - 1.5) / 0.5;
}
