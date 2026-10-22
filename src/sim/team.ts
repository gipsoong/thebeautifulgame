import { PITCH_W } from '../config';
import type { Vec2 } from '../math';

/** 0 = home (the human's team), attacks towards +x. 1 = away, attacks towards x = 0. */
export type TeamId = 0 | 1;
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Slot { role: Role; x: number; y: number } // x: fraction of pitch from own goal, y: 0..1 across

/** 4-4-2: keeper, back four, flat midfield four, two strikers. */
export const FOUR_FOUR_TWO: Slot[] = [
  { role: 'GK', x: 0.02, y: 0.5 },
  { role: 'DEF', x: 0.2, y: 0.14 },
  { role: 'DEF', x: 0.17, y: 0.38 },
  { role: 'DEF', x: 0.17, y: 0.62 },
  { role: 'DEF', x: 0.2, y: 0.86 },
  { role: 'MID', x: 0.42, y: 0.12 },
  { role: 'MID', x: 0.38, y: 0.38 },
  { role: 'MID', x: 0.38, y: 0.62 },
  { role: 'MID', x: 0.42, y: 0.88 },
  { role: 'FWD', x: 0.6, y: 0.38 },
  { role: 'FWD', x: 0.6, y: 0.62 },
];

export const attackDir = (t: TeamId): 1 | -1 => (t === 0 ? 1 : -1);
export const ownGoalX = (t: TeamId): number => (t === 0 ? 0 : PITCH_W);
export const oppGoalX = (t: TeamId): number => (t === 0 ? PITCH_W : 0);
export const other = (t: TeamId): TeamId => (t === 0 ? 1 : 0);

/** Converts a team-relative pitch fraction into world coordinates. */
export function toWorld(t: TeamId, fx: number, fy: number, pitchH: number): Vec2 {
  return { x: ownGoalX(t) + attackDir(t) * fx * PITCH_W, y: fy * pitchH };
}
