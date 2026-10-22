import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { createBall, stepBall } from '../src/sim/ball';

function simulate(seconds: number, init: Partial<ReturnType<typeof createBall>>) {
  const b = Object.assign(createBall(50, 34), init);
  let maxZ = 0;
  for (let t = 0; t < seconds; t += DT) { stepBall(b, DT); maxZ = Math.max(maxZ, b.z); }
  return { b, maxZ };
}

describe('ball', () => {
  it('a 15 m/s ground pass rolls a plausible distance and stops', () => {
    const { b } = simulate(20, { vx: 15 });
    expect(b.vx).toBe(0);
    expect(b.x - 50).toBeGreaterThan(30);
    expect(b.x - 50).toBeLessThan(60);
  });

  it('lands, bounces lower each time and settles on the grass', () => {
    const { b, maxZ } = simulate(10, { vx: 12, vz: 10, z: 0.01 });
    expect(maxZ).toBeGreaterThan(3);
    expect(maxZ).toBeLessThan(5.2); // drag keeps it under the vacuum peak of v^2/2g = 5.1 m
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });

  it('bounces off a post', () => {
    const b = Object.assign(createBall(103, 34 - 3.66), { vx: 20 });
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) hit = stepBall(b, DT);
    expect(hit).toBe(true);
    expect(b.vx).toBeLessThan(0);
  });
});
