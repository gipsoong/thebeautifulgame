import { CENTRE_Y, GOAL_H, GOAL_W, PITCH_W } from '../config';
import { clamp } from '../math';
import type { Ball } from './ball';

export interface Keeper { x: number; y: number; vy: number; cd: number }

export function createKeeper(): Keeper {
  return { x: PITCH_W - 0.6, y: CENTRE_Y, vy: 0, cd: 0 };
}

/** Keeper guarding the right-hand goal. Returns true on a save. */
export function stepKeeper(k: Keeper, ball: Ball, dt: number, rng: () => number = Math.random): boolean {
  k.cd = Math.max(0, k.cd - dt);
  // Predict where the ball crosses the goal line if it is heading for goal, else shadow it.
  let target = CENTRE_Y + (ball.y - CENTRE_Y) * 0.35;
  if (ball.vx > 2) {
    const t = (k.x - ball.x) / ball.vx;
    if (t > 0 && t < 2.5) target = ball.y + ball.vy * t;
  }
  target = clamp(target, CENTRE_Y - GOAL_W / 2 + 0.4, CENTRE_Y + GOAL_W / 2 - 0.4);
  const want = clamp((target - k.y) * 4, -4.5, 4.5);
  k.vy += clamp(want - k.vy, -20 * dt, 20 * dt);
  k.y += k.vy * dt;

  const dx = ball.x - k.x, dy = ball.y - k.y;
  const reach = 0.5 + Math.min(1.1, Math.abs(k.vy) * 0.25); // diving stretch
  if (k.cd === 0 && Math.abs(dx) < 0.6 && Math.abs(dy) < reach && ball.z < GOAL_H + 0.3) {
    const fast = Math.hypot(ball.vx, ball.vy) > 18 && Math.abs(dy) > 0.8;
    if (fast && rng() < 0.5) return false; // a hard shot at full stretch can beat him
    ball.vx = -Math.abs(ball.vx) * 0.35 - 2;
    ball.vy = ball.vy * 0.3 + (dy >= 0 ? 4 : -4);
    ball.vz = Math.abs(ball.vz) * 0.3 + 1.5;
    k.cd = 0.6;
    return true;
  }
  return false;
}
