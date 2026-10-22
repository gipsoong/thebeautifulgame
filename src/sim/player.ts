import {
  ACCEL, CHARGE_TIME, DECEL, DRIBBLE_FACTOR, JOG, KICK_BUFFER, PITCH_H, PITCH_W, REACH, SPRINT,
} from '../config';
import type { Actions } from '../input/actions';
import type { Vec2 } from '../math';
import type { Ball } from './ball';

export type KickKind = 'pass' | 'shoot' | 'lob';

export interface BufferedKick { kind: KickKind; power: number; t: number; aim: Vec2 | null }

export interface Player {
  x: number; y: number; vx: number; vy: number;
  fx: number; fy: number; // facing (unit)
  touchCd: number;
  charge: number;
  chargeKind: KickKind | null;
  buffered: BufferedKick | null;
  held: Record<KickKind, boolean>;
}

export function createPlayer(x: number, y: number): Player {
  return {
    x, y, vx: 0, vy: 0, fx: 1, fy: 0, touchCd: 0, charge: 0, chargeKind: null, buffered: null,
    held: { pass: false, shoot: false, lob: false },
  };
}

/** Hold to charge, release to queue the kick; it fires when the ball is in reach (see kick.ts). */
export function updateCharge(p: Player, a: Actions, dt: number): void {
  for (const kind of ['pass', 'shoot', 'lob'] as const) {
    const held = a[kind];
    if (held && !p.held[kind] && !p.chargeKind) { p.chargeKind = kind; p.charge = 0; }
    if (held && p.chargeKind === kind) p.charge = Math.min(1, p.charge + dt / CHARGE_TIME);
    if (!held && p.held[kind] && p.chargeKind === kind) {
      p.buffered = { kind, power: Math.max(0.15, p.charge), t: KICK_BUFFER, aim: a.aim };
      p.chargeKind = null; p.charge = 0;
    }
    p.held[kind] = held;
  }
}

export function stepPlayer(p: Player, ball: Ball, a: Actions, dt: number): void {
  const moving = a.mx !== 0 || a.my !== 0;
  const sprint = a.sprint && moving;
  const hasBall = Math.hypot(ball.x - p.x, ball.y - p.y) < 1.2 && ball.z < 0.5;
  const top = (sprint ? SPRINT : JOG) * (hasBall ? DRIBBLE_FACTOR : 1) * (p.chargeKind ? 0.75 : 1);
  const tx = a.mx * top, ty = a.my * top;
  const dx = tx - p.vx, dy = ty - p.vy, dm = Math.hypot(dx, dy);
  // Turning at speed means shedding velocity first: that is the momentum.
  const reversing = tx * p.vx + ty * p.vy < 0 || !moving;
  const maxDv = (reversing ? DECEL : ACCEL) * dt;
  if (dm > maxDv) { p.vx += (dx / dm) * maxDv; p.vy += (dy / dm) * maxDv; } else { p.vx = tx; p.vy = ty; }
  p.x = Math.max(-3, Math.min(PITCH_W + 3, p.x + p.vx * dt));
  p.y = Math.max(-3, Math.min(PITCH_H + 3, p.y + p.vy * dt));
  const sp = Math.hypot(p.vx, p.vy);
  if (a.aim && (p.chargeKind || sp < 0.5)) { p.fx = a.aim.x; p.fy = a.aim.y; }
  else if (sp > 0.3) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
  p.touchCd = Math.max(0, p.touchCd - dt);

  // Dribble touches: the ball is knocked ahead rather than glued to the foot.
  const bx = ball.x - p.x, by = ball.y - p.y, d = Math.hypot(bx, by);
  if (d < REACH && ball.z < 0.4 && p.touchCd === 0 && !p.buffered) {
    const relV = Math.hypot(ball.vx - p.vx, ball.vy - p.vy);
    if (sp > 0.8) {
      const push = sprint ? 1.55 : 1.3; // sprinting = longer, riskier touches
      ball.vx = p.fx * sp * push; ball.vy = p.fy * sp * push;
      ball.x = p.x + p.fx * 0.45; ball.y = p.y + p.fy * 0.45;
      p.touchCd = sprint ? 0.38 : 0.26;
    } else if (relV < 12) { // trap: kill the ball's pace
      ball.vx *= 0.15; ball.vy *= 0.15; p.touchCd = 0.15;
    } else { // too hot to control: deflects off the body
      ball.vx = -ball.vx * 0.3 + (bx / d) * 2; ball.vy = -ball.vy * 0.3 + (by / d) * 2; p.touchCd = 0.2;
    }
    ball.vz = 0; ball.z = 0;
  }
}
