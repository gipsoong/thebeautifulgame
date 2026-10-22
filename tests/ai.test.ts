import { describe, expect, it } from 'vitest';
import { type AIContext, getOpen } from '../src/sim/ai';
import { createBall } from '../src/sim/ball';
import { createPlayer } from '../src/sim/player';

describe('ai', () => {
  const ctxWith = (players: AIContext['players']): AIContext => ({
    ball: createBall(40, 34), players, possession: 0, carrier: players[0], chasers: [null, null],
    passTarget: null, sinceKick: 9, rng: () => 0.5,
  });

  it('a teammate moves away from his marker', () => {
    const carrier = createPlayer(40, 34, 0), mate = createPlayer(55, 20, 0), marker = createPlayer(56, 21, 1);
    const to = getOpen(mate, { x: 55, y: 20 }, carrier, ctxWith([carrier, mate, marker]));
    expect(Math.hypot(to.x - marker.x, to.y - marker.y)).toBeGreaterThan(3);
  });

  it('a teammate steps out of an opponent blocking the lane from the carrier', () => {
    const carrier = createPlayer(40, 34, 0), mate = createPlayer(60, 34, 0), blocker = createPlayer(50, 34.3, 1);
    const to = getOpen(mate, { x: 60, y: 34 }, carrier, ctxWith([carrier, mate, blocker]));
    expect(to.y).toBeLessThan(33.5); // moved to the side the blocker isn't on
  });

  it('stays put when nobody is near', () => {
    const carrier = createPlayer(40, 34, 0), mate = createPlayer(60, 20, 0), far = createPlayer(80, 60, 1);
    expect(getOpen(mate, { x: 60, y: 20 }, carrier, ctxWith([carrier, mate, far]))).toEqual({ x: 60, y: 20 });
  });
});
