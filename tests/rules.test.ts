import { describe, expect, it } from 'vitest';
import { DT, HALF_REAL_SECONDS, PITCH_W } from '../src/config';
import { NO_ACTIONS } from '../src/input/actions';
import { createBall } from '../src/sim/ball';
import { Match } from '../src/sim/match';
import { createPlayer } from '../src/sim/player';
import { inBox, offsidePlayers } from '../src/sim/rules';

describe('offside', () => {
  const passer = createPlayer(60, 34, 0, 'MID', 0);
  const lastDef = createPlayer(85, 30, 1, 'DEF', 1);
  const keeper = createPlayer(103, 34, 1, 'GK', 2);
  const ball = createBall(60.5, 34);

  it('flags a teammate beyond the second-last defender when the ball is played', () => {
    const runner = createPlayer(88, 40, 0, 'FWD', 3);
    expect(offsidePlayers(passer, [passer, lastDef, keeper, runner], ball).has(runner)).toBe(true);
  });

  it('is onside level with or behind the line, and in his own half', () => {
    const level = createPlayer(85, 40, 0, 'FWD', 3);
    const ownHalf = createPlayer(40, 40, 0, 'FWD', 4);
    const set = offsidePlayers(passer, [passer, lastDef, keeper, level, ownHalf], ball);
    expect(set.size).toBe(0);
  });

  it('works for the away team attacking the other way', () => {
    const awayPasser = createPlayer(45, 34, 1, 'MID', 5);
    const homeDef = createPlayer(20, 30, 0, 'DEF', 6), homeGk = createPlayer(2, 34, 0, 'GK', 7);
    const runner = createPlayer(15, 34, 1, 'FWD', 8);
    expect(offsidePlayers(awayPasser, [awayPasser, homeDef, homeGk, runner], createBall(44, 34)).has(runner)).toBe(true);
  });
});

describe('match flow', () => {
  it('knows its penalty areas', () => {
    expect(inBox(0, 10, 34)).toBe(true);
    expect(inBox(0, PITCH_W - 10, 34)).toBe(false);
    expect(inBox(1, PITCH_W - 10, 34)).toBe(true);
  });

  it('gives a penalty for a foul in the box and clears the area for it', () => {
    let s = 3; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const m = new Match(rng, 0);
    m.step(NO_ACTIONS, DT);
    const fouler = m.players.find((p) => p.team === 1 && p.role === 'DEF')!;
    const victim = m.players.find((p) => p.team === 0 && p.role === 'FWD')!;
    Object.assign(victim, { x: 98, y: 34 });
    (m as unknown as { foul(a: unknown, b: unknown, ev: unknown[]): void }).foul(fouler, victim, []);
    expect(m.restart?.kind).toBe('penalty');
    for (let i = 0; i < 300 && m.restart; i++) m.step(NO_ACTIONS, DT);
    const gk = m.players.find((p) => p.team === 1 && p.role === 'GK')!;
    expect(gk.x).toBeGreaterThan(PITCH_W - 1);
    expect(m.ball.x).toBeCloseTo(PITCH_W - 11, 5);
    for (const p of m.players) {
      if (p === gk || p === m.lastTouch) continue;
      expect(p.x).toBeLessThan(PITCH_W - 16.5);
    }
  });

  it('plays two halves and blows for full-time', () => {
    let s = 7; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const m = new Match(rng, 0);
    const whistles: string[] = [];
    for (let t = 0; t < HALF_REAL_SECONDS * 2.5 && !m.over; t += DT) {
      for (const e of m.step(NO_ACTIONS, DT)) if (e.type === 'whistle') whistles.push(e.period);
    }
    expect(whistles).toEqual(['half-time', 'second half', 'full-time']);
    expect(m.over).toBe(true);
  }, 30_000);
});
