import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { NO_ACTIONS } from '../src/input/actions';
import { Replay } from '../src/replay';
import { Match } from '../src/sim/match';

describe('goal replay', () => {
  it('plays back recorded positions and then restores the live state', () => {
    let seed = 1;
    const m = new Match(() => ((seed = (seed * 16807) % 2147483647) / 2147483647), 0);
    const r = new Replay();
    for (let t = 0; t < 3; t += DT) { m.step(NO_ACTIONS, DT); r.record(m); }
    const live = { x: m.ball.x, y: m.ball.y, p: m.players[5].x };
    r.start(m);
    expect(r.playing).toBe(true);
    r.step(m, 0.01);
    expect(m.players[5].x).not.toBe(live.p); // showing an earlier moment
    let n = 0;
    while (r.step(m, 0.1)) n++;
    expect(n).toBeGreaterThan(30); // about 3 s of play at 0.6x speed
    expect(r.playing).toBe(false);
    expect({ x: m.ball.x, y: m.ball.y, p: m.players[5].x }).toEqual(live);
  });
});
