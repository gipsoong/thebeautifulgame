import { SPRINT } from '../config';
import type { Camera } from './camera';

// Procedural animation: a 3D stick skeleton built in world space, then projected by the camera.
// Stride phase advances with distance actually covered, so feet plant instead of sliding.

export interface Anim {
  phase: number; amp: number; lean: number;
  pvx: number; pvy: number;
  dx: number; dy: number; // direction of travel
  kickT: number; // seconds since the kick, -1 when idle
  power: number;
  charge: number;
}

export function createAnim(): Anim {
  return { phase: 0, amp: 0, lean: 0, pvx: 0, pvy: 0, dx: 1, dy: 0, kickT: -1, power: 0, charge: 0 };
}

export function startKick(a: Anim, power: number): void { a.kickT = 0; a.power = power; }

export function stepAnim(a: Anim, vx: number, vy: number, fx: number, fy: number, dt: number, charge: number): void {
  const sp = Math.hypot(vx, vy);
  if (sp > 0.3) { a.dx = vx / sp; a.dy = vy / sp; } else { a.dx = fx; a.dy = fy; }
  const strideLen = 0.75 + 0.11 * sp; // metres per step; longer strides when sprinting
  a.phase += ((sp * dt) / strideLen) * Math.PI;
  a.amp += (Math.min(1, sp / SPRINT) - a.amp) * Math.min(1, 10 * dt);
  const af = ((vx - a.pvx) * a.dx + (vy - a.pvy) * a.dy) / dt; // forward acceleration
  a.pvx = vx; a.pvy = vy;
  const lean = Math.max(-0.22, Math.min(0.35, 0.02 * sp + 0.012 * af));
  a.lean += (lean - a.lean) * Math.min(1, 6 * dt);
  if (a.kickT >= 0) { a.kickT += dt; if (a.kickT > 0.45) a.kickT = -1; }
  a.charge = charge;
}

type P3 = [number, number, number];

export interface FigureStyle { shirt: string; shorts: string; skin: string; hair: string; boots: string }

/**
 * Draws a figure standing at (x, y). The body faces (fx, fy) while kicking, charging or when
 * `faceFixed` is set (the keeper side-steps facing play); otherwise it faces the direction of travel.
 */
export function drawFigure(
  ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, a: Anim,
  fx: number, fy: number, style: FigureStyle, faceFixed = false,
): void {
  if (cam.project(x, y, 1.7).hidden) return;
  const faceInput = faceFixed || a.kickT >= 0 || a.charge > 0;
  const fdx = faceInput ? fx : a.dx, fdy = faceInput ? fy : a.dy;
  const sx = -fdy, sy = fdx; // body's right
  const W = (f: number, s: number, z: number): P3 => [x + fdx * f + sx * s, y + fdy * f + sy * s, z];
  const { amp, phase: ph, lean } = a;
  const pelvisZ = 0.93 - 0.06 * amp + Math.abs(Math.sin(ph)) * 0.05 * amp;

  // Feet swing along the direction of travel and lift during the swing half of each cycle.
  const stride = 0.6 * amp + 0.05, lift = 0.28 * amp;
  const foot = (side: number, p: number): P3 => {
    const isKickLeg = side > 0 && (a.charge > 0 || a.kickT >= 0);
    if (isKickLeg) {
      let f = -0.15 - 0.35 * a.charge, z = 0.12 + 0.25 * a.charge; // wind-up while charging
      if (a.kickT >= 0) {
        const t = a.kickT;
        if (t < 0.08) { f = -0.5 + (t / 0.08) * 1.15; z = 0.35 * (1 - t / 0.08) + 0.1; } // strike
        else { // follow-through, higher on harder kicks
          const k = Math.min(1, (t - 0.08) / 0.37);
          f = (0.65 + 0.25 * a.power) * (1 - k); z = (0.25 + 0.45 * a.power) * (1 - k);
        }
      }
      return W(f, side * 0.11, z + 0.04);
    }
    const f = Math.sin(p) * stride, z = Math.max(0, Math.cos(p)) * lift;
    const base = W(0, side * 0.11, z + 0.04);
    return [base[0] + a.dx * f, base[1] + a.dy * f, base[2]];
  };
  const footL = foot(-1, ph), footR = foot(1, ph + Math.PI);
  const hipL = W(lean * 0.3, -0.11, pelvisZ), hipR = W(lean * 0.3, 0.11, pelvisZ);
  const knee = (h: P3, ft: P3): P3 => { // two-bone leg: the knee pushes forward as the leg shortens
    const d = Math.hypot(h[0] - ft[0], h[1] - ft[1], h[2] - ft[2]);
    const bend = Math.sqrt(Math.max(0, 0.475 * 0.475 - (d / 2) ** 2));
    return [(h[0] + ft[0]) / 2 + fdx * bend, (h[1] + ft[1]) / 2 + fdy * bend, (h[2] + ft[2]) / 2];
  };
  // Arms swing opposite to the legs, wider when sprinting.
  const armSwing = 0.38 * amp;
  const hand = (side: number, p: number): P3 =>
    W(lean - Math.sin(p) * armSwing, side * 0.24, pelvisZ + 0.02 + Math.abs(Math.sin(p)) * 0.12 * amp);
  const shL = W(lean * 0.95, -0.19, pelvisZ + 0.5), shR = W(lean * 0.95, 0.19, pelvisZ + 0.5);
  const handL = hand(-1, ph + Math.PI), handR = hand(1, ph);
  const elbow = (s: P3, h: P3): P3 =>
    [(s[0] + h[0]) / 2 - fdx * 0.06, (s[1] + h[1]) / 2 - fdy * 0.06, (s[2] + h[2]) / 2 + 0.02];

  const k = cam.project(x, y, 1).k;
  const seg = (pts: P3[], col: string, w: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, w * k); ctx.beginPath();
    pts.forEach((q, i) => { const p = cam.project(q[0], q[1], q[2]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
  };
  const leg = (h: P3, ft: P3) => {
    const kn = knee(h, ft);
    seg([h, kn], style.shorts, 0.17);
    seg([kn, ft], style.shirt, 0.13); // socks in shirt colour
    seg([ft, [ft[0] + fdx * 0.12, ft[1] + fdy * 0.12, ft[2]]], style.boots, 0.1);
  };
  const arm = (s: P3, h: P3) => seg([s, elbow(s, h), h], style.skin, 0.09);

  // Paint the limbs on the far side from the camera first.
  const leftFar = cam.view(...hipL).z > cam.view(...hipR).z;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (leftFar) { arm(shL, handL); leg(hipL, footL); } else { arm(shR, handR); leg(hipR, footR); }
  seg([W(lean * 0.3, 0, pelvisZ), W(lean, 0, pelvisZ + 0.5)], style.shirt, 0.4);
  seg([W(lean * 0.3, -0.1, pelvisZ + 0.03), W(lean * 0.3, 0.1, pelvisZ + 0.03)], style.shorts, 0.2);
  if (leftFar) { leg(hipR, footR); arm(shR, handR); } else { leg(hipL, footL); arm(shL, handL); }
  const hp = cam.project(...W(lean * 1.1, 0, pelvisZ + 0.72)), r = Math.max(2.5, 0.12 * k);
  ctx.fillStyle = style.skin; ctx.beginPath(); ctx.arc(hp.x, hp.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = style.hair; ctx.beginPath(); ctx.arc(hp.x, hp.y - 0.03 * k, r, Math.PI, 0); ctx.fill();
  ctx.lineCap = 'butt';
}
