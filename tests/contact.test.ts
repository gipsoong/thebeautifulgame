import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { createBall } from '../src/sim/ball';
import { collidePlayers, standingTackle, startSlide, stepSlide } from '../src/sim/contact';
import { createPlayer, stepPlayer } from '../src/sim/player';
import { NO_ACTIONS } from '../src/input/actions';

const always = () => 0; // rng that makes every roll succeed

describe('contact', () => {
  it('a standing tackle from the front takes the ball off a slow dribbler', () => {
    const carrier = createPlayer(50, 34, 1, 'MID', 1);
    carrier.fx = -1; // facing the tackler
    const ball = createBall(49.5, 34);
    const tackler = createPlayer(48.5, 34, 0, 'DEF', 2);
    const res = standingTackle(tackler, ball, carrier, always);
    expect(res?.type).toBe('won');
    expect(ball.vx).toBeGreaterThan(0); // knocked the way the tackler faces
    expect(carrier.touchCd).toBeGreaterThan(0);
  });

  it('a tackle out of reach whiffs and leaves the tackler committed', () => {
    const tackler = createPlayer(40, 34, 0, 'DEF', 2);
    const res = standingTackle(tackler, createBall(45, 34), null, always);
    expect(res).toBeNull();
    expect(tackler.state).toBe('tackle');
    expect(tackler.tackleCd).toBeGreaterThan(0);
  });

  it('a slide that reaches the ball first wins it; one that reaches the man first is a foul', () => {
    const clean = createPlayer(48, 34, 0, 'DEF', 1), ball = createBall(49, 34);
    startSlide(clean);
    let res = null;
    for (let i = 0; i < 30 && !res; i++) { stepPlayer(clean, ball, NO_ACTIONS, DT); res = stepSlide(clean, ball, [], always); }
    expect(res?.type).toBe('won');

    const late = createPlayer(48, 34, 0, 'DEF', 2), victim = createPlayer(49, 34, 1, 'FWD', 3);
    startSlide(late);
    res = null;
    for (let i = 0; i < 30 && !res; i++) { stepPlayer(late, createBall(60, 60), NO_ACTIONS, DT); res = stepSlide(late, createBall(60, 60), [victim], always); }
    expect(res?.type).toBe('foul');
    expect(victim.state).toBe('down');
  });

  it('pushes overlapping players apart', () => {
    const a = createPlayer(50, 34, 0, 'MID', 1), b = createPlayer(50.3, 34, 1, 'MID', 2);
    collidePlayers([a, b], null);
    expect(b.x - a.x).toBeCloseTo(0.8, 5);
  });
});
