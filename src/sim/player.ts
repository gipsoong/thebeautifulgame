import {
  ACCEL, CHARGE_TIME, DECEL, DOWN_TIME, DRIBBLE_FACTOR, GK_SPEED, JOG, KICK_BUFFER, PITCH_H, PITCH_W, REACH, SPRINT,
} from '../config';
import type { Actions } from '../input/actions';
import type { Vec2 } from '../math';
import type { Ball } from './ball';
import type { Role, TeamId } from './team';

export type KickKind = 'pass' | 'shoot' | 'lob';

export interface BufferedKick {
  kind: KickKind; power: number; t: number; aim: Vec2 | null;
  receiver?: Player; // intended target of a pass, for switching and for the AI to run onto it
}

/** normal: running about. tackle: committed to a standing tackle. slide: sliding. down: on the floor. */
export type PlayerState = 'normal' | 'tackle' | 'slide' | 'down';

export interface Player {
  id: number;
  team: TeamId;
  role: Role;
  slot: Vec2; // formation slot, team-relative fractions (see team.ts)
  x: number; y: number; vx: number; vy: number;
  fx: number; fy: number; // facing (unit)
  touchCd: number; // seconds until this player can touch the ball again
  charge: number;
  chargeKind: KickKind | null;
  buffered: BufferedKick | null;
  held: Record<KickKind | 'switch', boolean>; // last frame's buttons, for press/release edges
  state: PlayerState;
  stateT: number; // time left in the current non-normal state
  tackleCd: number;
  aiT: number; // seconds until the AI reconsiders its decision
  dribbleSide: 1 | -1; // which way the AI takes a defender on, kept between decisions
  pressedT: number; // how long the AI carrier has been under pressure
  runT: number; // time left on a forward run in behind
}

export function createPlayer(x: number, y: number, team: TeamId = 0, role: Role = 'MID', id = 0): Player {
  return {
    id, team, role, slot: { x: 0.5, y: 0.5 },
    x, y, vx: 0, vy: 0, fx: team === 0 ? 1 : -1, fy: 0, touchCd: 0, charge: 0, chargeKind: null, buffered: null,
    held: { pass: false, shoot: false, lob: false, switch: false },
    state: 'normal', stateT: 0, tackleCd: 0, aiT: 0, dribbleSide: id % 2 ? 1 : -1, pressedT: 0, runT: 0,
  };
}

export const canAct = (p: Player): boolean => p.state === 'normal';

/** Hold to charge, release to queue the kick; it fires when the ball is in reach (see kick.ts). */
export function updateCharge(p: Player, a: Actions, dt: number): void {
  for (const kind of ['pass', 'shoot', 'lob'] as const) {
    const held = a[kind];
    if (held && !p.held[kind] && !p.chargeKind) { p.chargeKind = kind; p.charge = 0; }
    if (held && p.chargeKind === kind) p.charge = Math.min(1, p.charge + dt / CHARGE_TIME);
    if (!held && p.held[kind] && p.chargeKind === kind) {
      queueKick(p, kind, Math.max(0.15, p.charge), a.aim);
      p.chargeKind = null; p.charge = 0;
    }
    p.held[kind] = held;
  }
}

export function queueKick(p: Player, kind: KickKind, power: number, aim: Vec2 | null): void {
  p.buffered = { kind, power, t: KICK_BUFFER, aim };
}

export function knockDown(p: Player, time = DOWN_TIME): void {
  p.state = 'down'; p.stateT = time; p.chargeKind = null; p.charge = 0; p.buffered = null;
}

export function stepPlayer(p: Player, ball: Ball, a: Actions, dt: number): void {
  p.touchCd = Math.max(0, p.touchCd - dt);
  p.tackleCd = Math.max(0, p.tackleCd - dt);
  if (p.state !== 'normal') {
    p.stateT -= dt;
    // Sliding and lying on the floor: no steering, just friction.
    const fr = p.state === 'slide' ? 7 : p.state === 'down' ? 14 : 10;
    const sp = Math.hypot(p.vx, p.vy), ns = Math.max(0, sp - fr * dt);
    if (sp > 0) { p.vx *= ns / sp; p.vy *= ns / sp; }
    move(p, dt);
    if (p.stateT <= 0) {
      if (p.state === 'slide') { p.state = 'down'; p.stateT = 0.45; } // getting back up
      else p.state = 'normal';
    }
    return;
  }

  const moving = a.mx !== 0 || a.my !== 0;
  const sprint = a.sprint && moving;
  const hasBall = Math.hypot(ball.x - p.x, ball.y - p.y) < 1.2 && ball.z < 0.5;
  const base = p.role === 'GK' ? GK_SPEED : sprint ? SPRINT : JOG;
  const top = base * (hasBall ? DRIBBLE_FACTOR : 1) * (p.chargeKind ? 0.75 : 1);
  const tx = a.mx * top, ty = a.my * top;
  const dx = tx - p.vx, dy = ty - p.vy, dm = Math.hypot(dx, dy);
  // Turning at speed means shedding velocity first: that is the momentum.
  const reversing = tx * p.vx + ty * p.vy < 0 || !moving;
  const maxDv = (reversing ? DECEL : ACCEL) * dt;
  if (dm > maxDv) { p.vx += (dx / dm) * maxDv; p.vy += (dy / dm) * maxDv; } else { p.vx = tx; p.vy = ty; }
  move(p, dt);
  const sp = Math.hypot(p.vx, p.vy);
  if (a.aim && (p.chargeKind || sp < 0.5)) { p.fx = a.aim.x; p.fy = a.aim.y; }
  else if (sp > 0.3) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
}

function move(p: Player, dt: number): void {
  p.x = Math.max(-3, Math.min(PITCH_W + 3, p.x + p.vx * dt));
  p.y = Math.max(-3, Math.min(PITCH_H + 3, p.y + p.vy * dt));
}

/**
 * Dribble touches: the ball is knocked ahead rather than glued to the foot.
 * Returns true if this player touched the ball.
 */
export function touchBall(p: Player, ball: Ball, sprinting: boolean): boolean {
  if (p.state !== 'normal' || p.touchCd > 0 || p.buffered) return false;
  const bx = ball.x - p.x, by = ball.y - p.y, d = Math.hypot(bx, by);
  if (d >= REACH || ball.z >= 0.4) return false;
  const sp = Math.hypot(p.vx, p.vy), relV = Math.hypot(ball.vx - p.vx, ball.vy - p.vy);
  if (sp > 0.8) {
    const push = sprinting ? 1.55 : 1.3; // sprinting = longer, riskier touches
    ball.vx = p.fx * sp * push; ball.vy = p.fy * sp * push;
    ball.x = p.x + p.fx * 0.45; ball.y = p.y + p.fy * 0.45;
    p.touchCd = sprinting ? 0.38 : 0.26;
  } else if (relV < 12) { // trap: kill the ball's pace
    ball.vx *= 0.15; ball.vy *= 0.15; p.touchCd = 0.15;
  } else { // too hot to control: deflects off the body
    ball.vx = -ball.vx * 0.3 + (bx / d) * 2; ball.vy = -ball.vy * 0.3 + (by / d) * 2; p.touchCd = 0.2;
  }
  ball.vz = 0; ball.z = 0;
  return true;
}
