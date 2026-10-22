import { describe, expect, it } from 'vitest';
import { DT, JOG, SPRINT } from '../src/config';
import { NO_ACTIONS } from '../src/input/actions';
import { createBall } from '../src/sim/ball';
import { createPlayer, stepPlayer, touchBall } from '../src/sim/player';

const farBall = () => createBall(0, 0);

describe('player movement', () => {
  it('accelerates to sprint speed over a few tenths of a second, not instantly', () => {
    const p = createPlayer(50, 34), ball = farBall(), a = { ...NO_ACTIONS, mx: 1, sprint: true };
    stepPlayer(p, ball, a, DT);
    expect(p.vx).toBeLessThan(1);
    for (let t = 0; t < 1; t += DT) stepPlayer(p, ball, a, DT);
    expect(p.vx).toBeCloseTo(SPRINT, 5);
  });

  it('scales top speed with skill (difficulty)', () => {
    const p = createPlayer(50, 34), ball = farBall(), a = { ...NO_ACTIONS, mx: 1, sprint: true };
    p.skill = 0.92;
    for (let t = 0; t < 1.5; t += DT) stepPlayer(p, ball, a, DT);
    expect(p.vx).toBeCloseTo(SPRINT * 0.92, 5);
  });

  it('has to brake before reversing direction', () => {
    const p = createPlayer(50, 34), ball = farBall();
    for (let t = 0; t < 1; t += DT) stepPlayer(p, ball, { ...NO_ACTIONS, mx: 1 }, DT);
    expect(p.vx).toBeCloseTo(JOG, 5);
    let t = 0;
    while (p.vx > 0) { stepPlayer(p, ball, { ...NO_ACTIONS, mx: -1 }, DT); t += DT; }
    expect(t).toBeGreaterThan(0.2);
  });

  it('knocks the ball ahead when dribbling instead of carrying it', () => {
    const p = createPlayer(50, 34), ball = createBall(52, 34), a = { ...NO_ACTIONS, mx: 1 };
    for (let t = 0; t < 1.5; t += DT) { stepPlayer(p, ball, a, DT); touchBall(p, ball, false); }
    expect(ball.vx).toBeGreaterThan(p.vx);
  });
});
