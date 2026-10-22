import { CENTRE_Y, GOAL_H, GOAL_W } from '../config';
import { clamp } from '../math';
import type { Ball } from './ball';
import type { Player } from './player';
import { attackDir, ownGoalX } from './team';

export type SaveResult = 'catch' | 'parry' | null;

/** Where the ball will cross the keeper's line, if it is heading for his goal soon. */
export function shotCrossingY(gk: Player, ball: Ball): number | null {
  const towards = -attackDir(gk.team) * ball.vx; // speed towards this keeper's goal
  if (towards < 2) return null;
  const t = Math.abs(gk.x - ball.x) / towards;
  return t > 0 && t < 2.5 ? ball.y + ball.vy * t : null;
}

/** Keeper positioning: on the line from the goal to the ball, coming off it as the ball gets close. */
export function keeperTarget(gk: Player, ball: Ball): { x: number; y: number } {
  const gx = ownGoalX(gk.team), dir = attackDir(gk.team);
  const cross = shotCrossingY(gk, ball);
  if (cross !== null) return { x: gk.x, y: clamp(cross, CENTRE_Y - GOAL_W / 2 + 0.3, CENTRE_Y + GOAL_W / 2 - 0.3) };
  const dx = ball.x - gx, dy = ball.y - CENTRE_Y, d = Math.hypot(dx, dy) || 1;
  const off = clamp(1 + (40 - d) * 0.08, 1, 4.5); // narrows the angle as the ball approaches
  return {
    x: gx + dir * Math.max(0.5, Math.abs((dx / d) * off)),
    y: clamp(CENTRE_Y + (dy / d) * off, CENTRE_Y - GOAL_W / 2 + 0.3, CENTRE_Y + GOAL_W / 2 - 0.3),
  };
}

/** Catches slower balls, parries harder ones, and can be beaten at full stretch. */
export function keeperSave(gk: Player, ball: Ball, rng: () => number): SaveResult {
  if (gk.state !== 'normal' || gk.touchCd > 0) return null;
  const dx = ball.x - gk.x, dy = ball.y - gk.y;
  const speed = Math.hypot(ball.vx, ball.vy);
  const reach = 0.5 + Math.min(0.9, Math.hypot(gk.vx, gk.vy) * 0.2); // diving stretch
  if (Math.abs(dx) > 0.7 || Math.abs(dy) > reach || ball.z > GOAL_H + 0.3) return null;
  if (speed > 18 && Math.abs(dy) > 0.9 && rng() < 0.5) return null; // a hard shot at full stretch beats him
  if (speed < 15 && ball.z < 2.2) return 'catch';
  const away = attackDir(gk.team);
  ball.vx = away * (Math.abs(ball.vx) * 0.35 + 2);
  ball.vy = ball.vy * 0.3 + (dy >= 0 ? 4 : -4);
  ball.vz = Math.abs(ball.vz) * 0.3 + 1.5;
  gk.touchCd = 0.6;
  return 'parry';
}
