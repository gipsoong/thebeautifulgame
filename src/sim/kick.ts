import { KICK_REACH, SPRINT } from '../config';
import { gauss } from '../math';
import type { Ball } from './ball';
import type { Player } from './player';

/** Fires a buffered kick if the ball is in reach. Returns the kick power (0..1) or null. */
export function tryKick(p: Player, ball: Ball, dt: number, rng: () => number = Math.random): number | null {
  const k = p.buffered;
  if (!k) return null;
  k.t -= dt;
  if (k.t <= 0) { p.buffered = null; return null; }
  const d = Math.hypot(ball.x - p.x, ball.y - p.y);
  if (d > KICK_REACH || ball.z > 1.3) return null;

  const dir = k.aim ?? { x: p.fx, y: p.fy };
  const pw = k.power, speed = Math.hypot(p.vx, p.vy);
  // Inaccuracy grows with power, running speed and how far the ball is from the sweet spot.
  const err = (0.015 + 0.07 * pw * pw + (0.025 * speed) / SPRINT + 0.04 * Math.max(0, d - 0.6)) * gauss(rng);
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
  p.touchCd = 0.35;
  p.buffered = null;
  return pw;
}
