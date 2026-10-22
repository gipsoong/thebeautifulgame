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

describe('aerial balls', () => {
  it('chests down a dropping ball instead of letting it pass through', () => {
    const p = createPlayer(50, 34), ball = createBall(50.3, 34);
    Object.assign(ball, { z: 1.1, vx: -9, vz: -3 });
    expect(touchBall(p, ball, false)).toBe(true);
    expect(Math.abs(ball.vx)).toBeLessThan(2);
    expect(ball.vz).toBeLessThanOrEqual(0);
  });

  it('heads a ball at head height towards the given target', () => {
    const p = createPlayer(50, 34), ball = createBall(50.2, 34);
    Object.assign(ball, { z: 1.9, vx: -12, vz: -1 });
    expect(touchBall(p, ball, false, { x: 1, y: 0 })).toBe(true);
    expect(ball.vx).toBeGreaterThan(5);
  });

  it('cannot reach a ball over its head', () => {
    const p = createPlayer(50, 34), ball = createBall(50.2, 34);
    Object.assign(ball, { z: 3, vx: -12 });
    expect(touchBall(p, ball, false)).toBe(false);
  });
});

describe('first touch', () => {
  const trap = (speed: number) => {
    const p = createPlayer(50, 34), ball = createBall(50.5, 34);
    ball.vx = -speed;
    touchBall(p, ball, false, undefined, () => 0.5);
    return Math.hypot(ball.vx, ball.vy);
  };
  it('kills a soft pass dead but lets a hard one get away a little', () => {
    expect(trap(5)).toBeLessThan(0.8);
    expect(trap(11)).toBeGreaterThan(trap(5) * 1.5);
  });
});

describe('stamina', () => {
  it('slows a player who sprints for too long, and recovers at a jog', () => {
    const p = createPlayer(10, 34), ball = farBall(), a = { ...NO_ACTIONS, mx: 1, sprint: true };
    for (let t = 0; t < 1; t += DT) stepPlayer(p, ball, a, DT);
    const fresh = p.vx;
    p.x = 10;
    for (let t = 0; t < 12; t += DT) { stepPlayer(p, ball, a, DT); if (p.x > 90) p.x = 10; }
    expect(p.vx).toBeLessThan(fresh * 0.85);
    for (let t = 0; t < 20; t += DT) stepPlayer(p, ball, NO_ACTIONS, DT);
    expect(p.stamina).toBeGreaterThan(0.9);
  });
});
