import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { NO_ACTIONS } from '../src/input/actions';
import { createBall, stepBall } from '../src/sim/ball';
import { keeperSave, startDive } from '../src/sim/keeper';
import { createPlayer, stepPlayer } from '../src/sim/player';

describe('keeper', () => {
  // Away keeper (team 1) guards the goal at x = 105.
  const shotAtCorner = () => Object.assign(createBall(92, 34), { vx: 24, vy: 2.6, vz: 1 });

  it('dives towards a shot heading for the corner and can save it at full stretch', () => {
    const gk = createPlayer(104, 34, 1, 'GK', 1), ball = shotAtCorner();
    let dived = false, saved = false;
    for (let t = 0; t < 1 && ball.x < 105; t += DT) {
      dived ||= startDive(gk, ball);
      stepPlayer(gk, ball, NO_ACTIONS, DT);
      stepBall(ball, DT);
      saved ||= keeperSave(gk, ball, () => 0.9) !== null;
    }
    expect(dived).toBe(true);
    expect(saved).toBe(true);
  });

  it('does not dive for a shot straight at him', () => {
    const gk = createPlayer(104, 34, 1, 'GK', 1);
    const ball = Object.assign(createBall(92, 34), { vx: 24, vy: 0, vz: 1 });
    expect(startDive(gk, ball)).toBe(false);
  });
});
