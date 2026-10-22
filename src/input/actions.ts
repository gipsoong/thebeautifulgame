import type { Vec2 } from '../math';

/** Device-independent controls. Gameplay code only ever sees this. */
export interface Actions {
  mx: number; // movement, |m| <= 1
  my: number;
  aim: Vec2 | null; // unit vector, or null to use the player's facing
  sprint: boolean;
  pass: boolean;
  shoot: boolean;
  lob: boolean;
}

export const NO_ACTIONS: Actions = { mx: 0, my: 0, aim: null, sprint: false, pass: false, shoot: false, lob: false };
