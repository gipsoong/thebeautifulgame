import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { createBall, stepBall } from '../src/sim/ball';
import { lobPowerFor, passPowerFor, pickReceiver, tryKick } from '../src/sim/kick';
import { createPlayer, queueKick } from '../src/sim/player';

describe('passing', () => {
  it('hits longer passes harder', () => {
    expect(passPowerFor(30)).toBeGreaterThan(passPowerFor(10));
    expect(lobPowerFor(35)).toBeGreaterThan(lobPowerFor(15));
  });

  it('pass assist picks the teammate lined up with the aim, not the nearest one', () => {
    const me = createPlayer(50, 34, 0, 'MID', 0);
    const near = createPlayer(50, 40, 0, 'MID', 1); // 6 m away, at 90 degrees
    const ahead = createPlayer(70, 35, 0, 'FWD', 2); // 20 m away, almost straight ahead
    expect(pickReceiver(me, { x: 1, y: 0 }, [me, near, ahead])).toBe(ahead);
    expect(pickReceiver(me, { x: 0, y: 1 }, [me, near, ahead])).toBe(near);
    expect(pickReceiver(me, { x: -1, y: 0 }, [me, near, ahead])).toBeNull();
  });
});

describe('shooting', () => {
  const shoot = (power: number) => {
    const p = createPlayer(87, 28, 0, 'FWD', 0), ball = createBall(87.6, 28);
    queueKick(p, 'shoot', power, { x: 105 - 87.6, y: 31 - 28 }); // at the near-post side of the goal
    tryKick(p, ball, DT, () => 0.5); // no random error
    let midY = 0;
    while (ball.x < 105) { stepBall(ball, DT); if (!midY && ball.x > 96.3) midY = ball.y; }
    return { endY: ball.y, bow: 29.5 - midY }; // halfway, how far outside the straight line it is
  };

  it('curls a placed shot: it starts outside the target and bends back in', () => {
    const placed = shoot(0.3);
    expect(Math.abs(placed.endY - 31)).toBeLessThan(1.2);
    expect(placed.bow).toBeGreaterThan(0.3);
  });

  it('drives a hard shot straight', () => {
    const driven = shoot(0.9);
    expect(Math.abs(driven.endY - 31)).toBeLessThan(0.5);
    expect(Math.abs(driven.bow)).toBeLessThan(0.15);
  });
});
