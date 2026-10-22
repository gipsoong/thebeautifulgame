import { describe, expect, it } from 'vitest';
import { CAMS, Camera } from '../src/render/camera';

describe('camera', () => {
  it.each(CAMS.map((_, i) => i))('screen -> pitch -> screen round-trips for preset %i', (i) => {
    const cam = new Camera();
    cam.preset = i;
    cam.update(1200, 700, 1);
    for (const [x, y] of [[45, 34], [60, 10], [30, 60]]) {
      const s = cam.project(x, y, 0);
      if (s.hidden) continue;
      const w = cam.toWorld(s.x, s.y)!;
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.y).toBeCloseTo(y, 6);
    }
  });

  it('draws the far touchline above the near one', () => {
    const cam = new Camera();
    cam.update(1200, 700, 1);
    expect(cam.project(45, 0).y).toBeLessThan(cam.project(45, 68).y);
  });
});
