import { describe, expect, it } from 'vitest';
import { DT, PITCH_H, PITCH_W } from '../src/config';
import { NO_ACTIONS } from '../src/input/actions';
import { Match } from '../src/sim/match';

/** Small deterministic PRNG so match simulations are repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(seconds: number, seed: number) {
  const m = new Match(mulberry32(seed), 0);
  const stats = { kicks: [0, 0], messages: new Map<string, number>() };
  for (let t = 0; t < seconds; t += DT) {
    for (const e of m.step(NO_ACTIONS, DT)) {
      if (e.type === 'kick') stats.kicks[e.player.team]++;
      if (e.type === 'message') stats.messages.set(e.text, (stats.messages.get(e.text) ?? 0) + 1);
    }
    for (const p of [...m.players, m.ball]) {
      if (![p.x, p.y, p.vx, p.vy].every(Number.isFinite)) throw new Error(`non-finite state at t=${t.toFixed(2)}`);
    }
  }
  return { m, stats };
}

describe('match', () => {
  it('runs AI against AI for five minutes without breaking', () => {
    const { m, stats } = simulate(300, 1);
    expect(stats.kicks[0]).toBeGreaterThan(20);
    expect(stats.kicks[1]).toBeGreaterThan(20);
    expect(m.ball.x).toBeGreaterThan(-5);
    expect(m.ball.x).toBeLessThan(PITCH_W + 5);
    expect(m.ball.y).toBeGreaterThan(-5);
    expect(m.ball.y).toBeLessThan(PITCH_H + 5);
  }, 30_000);

  it('fields two teams of eleven and starts with a kick-off taken by the human', () => {
    const m = new Match(mulberry32(2));
    expect(m.players.filter((p) => p.team === 0)).toHaveLength(11);
    expect(m.players.filter((p) => p.team === 1)).toHaveLength(11);
    expect(m.restart?.kind).toBe('kickoff');
    m.step(NO_ACTIONS, DT);
    expect(m.controlled[0].team).toBe(0);
    expect(m.controlled[0].role).toBe('FWD');
    // Opponents wait outside the centre circle until the ball is played.
    for (const p of m.players.filter((q) => q.team === 1)) {
      expect(Math.hypot(p.x - PITCH_W / 2, p.y - PITCH_H / 2)).toBeGreaterThanOrEqual(9.1);
    }
  });

  it('lets a second person steer the away side', () => {
    const m = new Match(mulberry32(4), 2);
    const p2 = m.controlled[1], start = p2.y;
    expect(p2.team).toBe(1);
    for (let t = 0; t < 1; t += DT) m.step(NO_ACTIONS, DT, { ...NO_ACTIONS, my: 1 });
    expect(p2.y - start).toBeGreaterThan(3);
    // Nobody on the home side pressed anything, so the home kick-off taker has not kicked it.
    expect(Math.hypot(m.ball.x - PITCH_W / 2, m.ball.y - PITCH_H / 2)).toBeLessThan(0.5);
  });

  it('gets shots away in AI-only play', () => {
    // Summed over a few seeds: single matches vary a lot, as real ones do.
    let shots = 0;
    for (const seed of [1, 2, 3, 4]) {
      const m = new Match(mulberry32(seed), 0);
      for (let t = 0; t < 300; t += DT) for (const e of m.step(NO_ACTIONS, DT)) if (e.type === 'kick' && e.kind === 'shoot') shots++;
    }
    expect(shots).toBeGreaterThan(6);
  }, 60_000);
});
