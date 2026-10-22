import { PLAYER_R, SLIDE_SPEED, SLIDE_TIME, SPRINT, TACKLE_COOLDOWN, TACKLE_REACH } from '../config';
import type { Ball } from './ball';
import { type Player, knockDown } from './player';

export type ContactEvent =
  | { type: 'won'; by: Player } // tackler took the ball
  | { type: 'foul'; by: Player; on: Player };

/**
 * Standing tackle: a short lunge at the ball. Succeeds more often from the front and against a slow
 * dribbler; a miss leaves the tackler stuck for a moment.
 */
export function standingTackle(p: Player, ball: Ball, carrier: Player | null, rng: () => number): ContactEvent | null {
  if (p.state !== 'normal' || p.tackleCd > 0) return null;
  p.state = 'tackle'; p.stateT = 0.35; p.tackleCd = TACKLE_COOLDOWN;
  const bx = ball.x - p.x, by = ball.y - p.y, d = Math.hypot(bx, by);
  const facing = d > 0 ? (bx * p.fx + by * p.fy) / d : 1;
  if (d > TACKLE_REACH || ball.z > 0.7 || facing < 0.2) { p.vx *= 0.3; p.vy *= 0.3; return null; }
  let chance = 0.55 + 0.3 * facing;
  if (carrier && carrier.team !== p.team) {
    chance -= 0.25 * (Math.hypot(carrier.vx, carrier.vy) / SPRINT);
    // Coming through the back of the man rather than the ball is a foul.
    const cx = carrier.x - p.x, cy = carrier.y - p.y;
    const behind = carrier.fx * cx + carrier.fy * cy > 0.75 * Math.hypot(cx, cy) && Math.hypot(cx, cy) < d;
    if (behind && rng() < 0.35) { knockDown(carrier, 0.8); return { type: 'foul', by: p, on: carrier }; }
    if (rng() > chance) { p.vx *= 0.3; p.vy *= 0.3; return null; }
    carrier.touchCd = 0.5;
  }
  ball.vx = p.fx * 3 + (rng() - 0.5) * 2; ball.vy = p.fy * 3 + (rng() - 0.5) * 2; ball.vz = 0; ball.z = 0;
  p.touchCd = 0.1;
  return { type: 'won', by: p };
}

/** Starts a slide in the facing direction. Contact is resolved each step by `stepSlide`. */
export function startSlide(p: Player): boolean {
  if (p.state !== 'normal' || p.tackleCd > 0) return false;
  const sp = Math.max(SLIDE_SPEED, Math.hypot(p.vx, p.vy) + 1.5);
  p.vx = p.fx * sp; p.vy = p.fy * sp;
  p.state = 'slide'; p.stateT = SLIDE_TIME; p.tackleCd = TACKLE_COOLDOWN * 1.5;
  p.chargeKind = null; p.buffered = null;
  return true;
}

const slideTouched = new WeakSet<Player>();

/** A slide that reaches the ball first pokes it away; one that reaches the man first is a foul. */
export function stepSlide(p: Player, ball: Ball, others: Player[], rng: () => number): ContactEvent | null {
  if (p.state !== 'slide') { slideTouched.delete(p); return null; }
  if (!slideTouched.has(p) && Math.hypot(ball.x - p.x, ball.y - p.y) < 0.95 && ball.z < 0.5) {
    slideTouched.add(p);
    const side = rng() < 0.5 ? -1 : 1;
    ball.vx = p.vx * 0.8 - p.fy * side * 3; ball.vy = p.vy * 0.8 + p.fx * side * 3; ball.vz = 0.5;
    return { type: 'won', by: p };
  }
  for (const o of others) {
    if (o.team === p.team || o.state === 'down') continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) < 0.85) {
      knockDown(o);
      if (!slideTouched.has(p)) return { type: 'foul', by: p, on: o };
    }
  }
  return null;
}

/**
 * Pushes overlapping players apart with a soft, mostly inelastic bump. A hard enough shoulder
 * charge knocks the ball carrier off balance.
 */
export function collidePlayers(ps: Player[], carrier: Player | null): void {
  const min = PLAYER_R * 2;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.state === 'down' || b.state === 'down') continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const j2 = -rel * 0.6; // impulse shared equally
        a.vx -= nx * j2 * 0.5; a.vy -= ny * j2 * 0.5; b.vx += nx * j2 * 0.5; b.vy += ny * j2 * 0.5;
        if (carrier && (a === carrier || b === carrier) && a.team !== b.team && -rel > 3.5) carrier.touchCd = 0.3;
      }
    }
  }
}
