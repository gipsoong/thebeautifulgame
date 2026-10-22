import { KICK_REACH, SPRINT } from '../config';
import { type Vec2, clamp, gauss, norm } from '../math';
import type { Ball } from './ball';
import type { Player } from './player';

/** Pass power (0..1) that gets a ground pass to `dist` metres arriving at a controllable pace. */
export function passPowerFor(dist: number): number {
  const arrive = 7, decel = 2.4; // m/s on arrival, rough average rolling deceleration
  const v0 = Math.sqrt(arrive * arrive + 2 * decel * dist);
  return clamp((v0 - 8) / 16, 0.05, 1);
}

/**
 * Pass assist: the teammate best lined up with `aim` within a 40 degree cone, or null.
 * Prefers players closer to the aim line, then nearer ones.
 */
export function pickReceiver(p: Player, aim: Vec2, team: Player[]): Player | null {
  let best: Player | null = null, bestScore = -Infinity;
  for (const t of team) {
    if (t === p || t.state === 'down') continue;
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    if (d < 2 || d > 50) continue;
    const cos = (dx * aim.x + dy * aim.y) / d;
    if (cos < Math.cos((40 * Math.PI) / 180)) continue;
    const score = cos * 3 - d / 25;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/** Where to play the ball so a running receiver meets it. */
export function leadTarget(from: Vec2, r: Player, ballSpeed: number): Vec2 {
  const t = Math.hypot(r.x - from.x, r.y - from.y) / Math.max(8, ballSpeed);
  return { x: r.x + r.vx * t * 0.8, y: r.y + r.vy * t * 0.8 };
}

/** Fires a buffered kick if the ball is in reach. Returns the kick power (0..1) or null. */
export function tryKick(p: Player, ball: Ball, dt: number, rng: () => number = Math.random): number | null {
  const k = p.buffered;
  if (!k) return null;
  k.t -= dt;
  if (k.t <= 0 || p.state !== 'normal') { p.buffered = null; return null; }
  const d = Math.hypot(ball.x - p.x, ball.y - p.y);
  if (d > KICK_REACH || ball.z > 1.3) return null;

  const dir = k.aim ? norm(k.aim.x, k.aim.y) : { x: p.fx, y: p.fy };
  const pw = k.power, speed = Math.hypot(p.vx, p.vy);
  // Inaccuracy grows with power, running speed and how far the ball is from the sweet spot.
  const err = (0.015 + 0.07 * pw * pw + (0.025 * speed) / SPRINT + 0.04 * Math.max(0, d - 0.6)) * gauss(rng) / p.skill ** 3;
  const a = Math.atan2(dir.y, dir.x) + err;
  let v: number, vz: number;
  switch (k.kind) {
    case 'pass': v = 8 + 16 * pw; vz = 0.4 * pw; break;
    case 'shoot': v = 17 + 15 * pw; vz = 1.2 + 4.2 * pw * pw + Math.abs(gauss(rng)) * pw; break;
    case 'lob': v = 9 + 11 * pw; vz = 6 + 5 * pw; break;
  }
  ball.vx = Math.cos(a) * v + p.vx * 0.3;
  ball.vy = Math.sin(a) * v + p.vy * 0.3;
  ball.vz = vz;
  ball.z = Math.max(ball.z, 0.01);
  ball.spin = (k.kind === 'shoot' ? gauss(rng) * 0.8 : 0) * pw; // slight random swerve on hard shots
  p.fx = dir.x; p.fy = dir.y;
  p.touchCd = 0.35;
  p.buffered = null;
  return pw;
}

/** Lob power (0..1) that roughly lands the ball `dist` metres away. */
export function lobPowerFor(dist: number): number {
  return clamp((dist - 9) / 29, 0, 1);
}
