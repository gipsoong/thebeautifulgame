import type { Vec2 } from '../math';

// Pseudo-3D: a perspective camera behind the near touchline looking across the pitch.
// World: x along the pitch, y across it (0 = far touchline), z up.

export const NEAR = 0.6; // near clipping plane (m)
const HORIZON = 0.55; // screen height fraction where the look-at point sits

export interface CamPreset { name: string; back: number; height: number; fov: number }

export const CAMS: CamPreset[] = [
  { name: 'Broadcast', back: 55, height: 26, fov: 0.62 },
  { name: 'Low broadcast', back: 20, height: 7, fov: 1.05 },
  { name: 'End-to-end tilt', back: 6, height: 40, fov: 1.0 },
];

export interface CamPoint { x: number; y: number; z: number }
export interface ScreenPoint { x: number; y: number; k: number; hidden: boolean }

export class Camera {
  x = 45; // look-at point on the grass
  y = 34;
  preset = 0;
  W = 1; // viewport size in CSS pixels
  H = 1;
  private back = CAMS[0].back;
  private height = CAMS[0].height;
  private fov = CAMS[0].fov;
  private eye: [number, number, number] = [0, 0, 0];
  private f: [number, number] = [0, 0]; // forward (y, z); x component is 0
  private u: [number, number] = [0, 0]; // up (y, z); right is +x
  private focal = 1;

  cycle(): void { this.preset = (this.preset + 1) % CAMS.length; }

  /** `blend` = 1 snaps to the preset; smaller values ease towards it. */
  update(W: number, H: number, blend = 0.08): void {
    const p = CAMS[this.preset];
    this.W = W; this.H = H;
    this.back += (p.back - this.back) * blend;
    this.height += (p.height - this.height) * blend;
    this.fov += (p.fov - this.fov) * blend;
    this.eye = [this.x, this.y + this.back, this.height];
    const L = Math.hypot(this.back, this.height);
    this.f = [-this.back / L, -this.height / L];
    this.u = [-this.height / L, this.back / L];
    this.focal = W / (2 * Math.tan(this.fov / 2));
  }

  view(x: number, y: number, z: number): CamPoint {
    const dx = x - this.eye[0], dy = y - this.eye[1], dz = z - this.eye[2];
    return { x: dx, y: dy * this.u[0] + dz * this.u[1], z: dy * this.f[0] + dz * this.f[1] };
  }

  screen(c: CamPoint): ScreenPoint {
    const zc = Math.max(NEAR, c.z);
    return {
      x: this.W / 2 + (this.focal * c.x) / zc,
      y: this.H * HORIZON - (this.focal * c.y) / zc,
      k: this.focal / zc, // pixels per metre at that depth
      hidden: c.z < NEAR,
    };
  }

  project(x: number, y: number, z = 0): ScreenPoint { return this.screen(this.view(x, y, z)); }

  /** Ray through a screen pixel intersected with the grass (z = 0). Null if it misses (above the horizon). */
  toWorld(sx: number, sy: number): Vec2 | null {
    const a = sx - this.W / 2, b = -(sy - this.H * HORIZON);
    const dy = b * this.u[0] + this.focal * this.f[0], dz = b * this.u[1] + this.focal * this.f[1];
    if (dz >= -1e-6) return null;
    const t = -this.eye[2] / dz;
    return { x: this.eye[0] + a * t, y: this.eye[1] + dy * t };
  }
}
