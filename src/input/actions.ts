import type { Vec2 } from '../math';

/** Device-independent controls. Gameplay code only ever sees this. */
export interface Actions {
  mx: number; // movement, |m| <= 1
  my: number;
  aim: Vec2 | null; // unit vector, or null to use the player's facing
  sprint: boolean;
  pass: boolean; // when defending: hold to press the ball carrier
  shoot: boolean; // when defending: standing tackle
  lob: boolean; // when defending: slide tackle
  switch: boolean; // change to the teammate nearest the ball
}

export const NO_ACTIONS: Actions = {
  mx: 0, my: 0, aim: null, sprint: false, pass: false, shoot: false, lob: false, switch: false,
};
