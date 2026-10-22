import { describe, expect, it } from 'vitest';
import { lobPowerFor, passPowerFor, pickReceiver } from '../src/sim/kick';
import { createPlayer } from '../src/sim/player';

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
