import { BALL_R, CENTRE_Y, GOAL_D, GOAL_H, GOAL_W, PITCH_H, PITCH_W } from '../config';
import type { Match } from '../sim/match';
import { CAMS, type CamPoint, Camera, NEAR } from './camera';
import type { Player } from '../sim/player';
import { type Anim, type FigureStyle, type Pose, drawFigure } from './figure';

type P3 = [number, number, number?];

/** Player 1 (home) and player 2 (away) marker colours. */
const MARKER = ['#f2c230', '#6fd3ff'];
const HOME: FigureStyle = { shirt: '#f2c230', shorts: '#15201a', skin: '#e8c7a4', hair: '#2a1c12', boots: '#0d0d0d' };
const AWAY: FigureStyle = { shirt: '#3d7fe0', shorts: '#f1f4f8', skin: '#c99872', hair: '#1a1410', boots: '#0d0d0d' };
const HOME_GK: FigureStyle = { ...HOME, shirt: '#3fbf6f' };
const AWAY_GK: FigureStyle = { ...AWAY, shirt: '#e0559a', shorts: '#15201a' };
export const KIT_COLOURS = [HOME.shirt, AWAY.shirt] as const;

const kit = (p: Player): FigureStyle =>
  p.team === 0 ? (p.role === 'GK' ? HOME_GK : HOME) : p.role === 'GK' ? AWAY_GK : AWAY;
const pose = (p: Player): Pose => (p.state === 'normal' ? 'run' : p.state);
const LINE = 'rgba(233,242,230,0.9)';
const NET = 'rgba(255,255,255,0.35)';

export interface Overlay { message: string; messageT: number }

export class Renderer {
  readonly cam = new Camera();
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(m: Match, anims: Map<Player, Anim>, o: Overlay): void {
    const { ctx, cam } = this;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const { ball } = m;
    // With two people playing, the camera shares itself out and just follows the ball.
    const player = m.humans === 2 ? ball : m.controlled[0];

    // Camera follows the ball, leaning slightly towards the controlled player and where the ball is going.
    const tx = ball.x * 0.75 + player.x * 0.25 + ball.vx * 0.25, ty = ball.y * 0.75 + player.y * 0.25 + ball.vy * 0.1;
    cam.x += (Math.max(8, Math.min(PITCH_W - 8, tx)) - cam.x) * 0.05;
    cam.y += (Math.max(16, Math.min(PITCH_H - 6, ty)) - cam.y) * 0.04;
    cam.update(W, H);

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#0a1410'); sky.addColorStop(1, '#1b2a22');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    this.poly([[-30, -8], [PITCH_W + 30, -8], [PITCH_W + 30, -8, 9], [-30, -8, 9]], '#26332c'); // far stand
    this.poly([[-30, -4], [PITCH_W + 30, -4], [PITCH_W + 30, PITCH_H + 40], [-30, PITCH_H + 40]], '#17482a');
    for (let i = -2; i < 23; i++) { // mown stripes, 5 m wide
      this.poly([[i * 5, -4], [i * 5 + 5, -4], [i * 5 + 5, PITCH_H + 4], [i * 5, PITCH_H + 4]], i % 2 ? '#1f5a32' : '#236538');
    }
    this.poly([[-4, -6], [PITCH_W + 4, -6], [PITCH_W + 4, -6, 1], [-4, -6, 1]], '#c9a227'); // advertising boards
    this.markings();

    // Flat things on the grass first: shadows and the aim line.
    for (const p of m.players) this.shadow(p.x, p.y, p.state === 'down' ? 0.9 : 0.45, 0.2, 0.3);
    const marked = m.humans === 2 ? m.controlled : [m.controlled[0]];
    marked.forEach((p, i) => this.marker(p, MARKER[i]));
    this.shadow(ball.x, ball.y, 0.14, 0.07, 0.4 / (1 + ball.z * 0.4));
    marked.forEach((p, i) => {
      if (!p.chargeKind) return;
      const L = 4 + 10 * p.charge;
      ctx.strokeStyle = MARKER[i]; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      this.line([[p.x, p.y], [p.x + p.fx * L, p.y + p.fy * L]]);
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    });

    // Upright things, painted far side first so nearer ones overlap.
    const things: { y: number; draw: () => void }[] = [];
    for (const side of [0, 1] as const) {
      things.push({ y: CENTRE_Y - GOAL_W / 2 - 0.01, draw: () => this.goal(side, 'far') });
      things.push({ y: CENTRE_Y + GOAL_W / 2 + 0.01, draw: () => this.goal(side, 'near') });
    }
    for (const p of m.players) {
      things.push({ y: p.y, draw: () => drawFigure(ctx, cam, p.x, p.y, anims.get(p)!, p.fx, p.fy, kit(p), p.role === 'GK', pose(p)) });
    }
    things.push({ y: ball.y, draw: () => this.ball(m) });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());

    for (const pl of marked) { // power bar
      if (!pl.chargeKind) continue;
      const p = cam.project(pl.x, pl.y, 2.3), bw = 60;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p.x - bw / 2, p.y - 8, bw, 6);
      ctx.fillStyle = pl.charge > 0.8 ? '#ff6b4a' : '#f2c230'; ctx.fillRect(p.x - bw / 2, p.y - 8, bw * pl.charge, 6);
    }
    if (o.messageT > 0) {
      ctx.globalAlpha = Math.min(1, o.messageT * 2);
      ctx.font = `700 ${Math.min(72, W / 9)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#f3f6ef'; ctx.fillText(o.message.toUpperCase(), W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }
    this.radar(m, W, H);
    ctx.font = '500 12px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(243,246,239,0.6)';
    ctx.textAlign = 'right'; ctx.fillText(`Camera: ${CAMS[cam.preset].name} (C / View)`, W - 16, H - 16);
    ctx.textAlign = 'left';
  }

  /** Ring on the grass under the controlled player, plus a pointer above his head. */
  private marker(p: Player, colour: string): void {
    const { ctx } = this;
    ctx.strokeStyle = colour; ctx.lineWidth = 2;
    const pts: P3[] = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([p.x + Math.cos(a) * 0.7, p.y + Math.sin(a) * 0.7]); }
    this.line(pts);
    const top = this.cam.project(p.x, p.y, 2.15);
    if (top.hidden) return;
    const s = Math.max(5, 0.18 * top.k);
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.moveTo(top.x - s, top.y - s * 1.2); ctx.lineTo(top.x + s, top.y - s * 1.2); ctx.lineTo(top.x, top.y); ctx.closePath(); ctx.fill();
  }

  /** Top-down mini-map, bottom centre. */
  private radar(m: Match, W: number, H: number): void {
    const { ctx } = this, rw = Math.min(180, W * 0.3), rh = (rw * PITCH_H) / PITCH_W;
    const x0 = (W - rw) / 2, y0 = H - rh - 14, sx = rw / PITCH_W;
    ctx.fillStyle = 'rgba(10,22,15,0.7)'; ctx.fillRect(x0 - 4, y0 - 4, rw + 8, rh + 8);
    ctx.strokeStyle = 'rgba(233,242,230,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, rw, rh);
    ctx.beginPath(); ctx.moveTo(x0 + rw / 2, y0); ctx.lineTo(x0 + rw / 2, y0 + rh); ctx.stroke();
    for (const p of m.players) {
      ctx.fillStyle = kit(p).shirt;
      ctx.beginPath(); ctx.arc(x0 + p.x * sx, y0 + p.y * sx, m.controlled.includes(p) ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x0 + m.ball.x * sx, y0 + m.ball.y * sx, 2, 0, Math.PI * 2); ctx.fill();
  }

  // --- primitives, clipped against the near plane so geometry behind a low camera never folds back ---

  private clipEdge(a: CamPoint, b: CamPoint): CamPoint {
    const t = (NEAR - a.z) / (b.z - a.z);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR };
  }

  private poly(pts: P3[], fill?: string, stroke?: string): void {
    const cs = pts.map(([x, y, z]) => this.cam.view(x, y, z ?? 0)), out: CamPoint[] = [];
    cs.forEach((a, i) => {
      const b = cs[(i + 1) % cs.length];
      if (a.z >= NEAR) out.push(a);
      if (a.z >= NEAR !== b.z >= NEAR) out.push(this.clipEdge(a, b));
    });
    if (out.length < 3) return;
    const { ctx } = this;
    ctx.beginPath();
    out.forEach((c, i) => { const p = this.cam.screen(c); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  private line(pts: P3[]): void {
    const { ctx, cam } = this;
    ctx.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      let a = cam.view(pts[i][0], pts[i][1], pts[i][2] ?? 0), b = cam.view(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2] ?? 0);
      if (a.z < NEAR && b.z < NEAR) continue;
      if (a.z < NEAR) a = this.clipEdge(a, b); else if (b.z < NEAR) b = this.clipEdge(a, b);
      const p = cam.screen(a), q = cam.screen(b);
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  private arc(cx: number, cy: number, r: number, a0: number, a1: number): void {
    const pts: P3[] = [];
    for (let i = 0; i <= 40; i++) { const a = a0 + ((a1 - a0) * i) / 40; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    this.line(pts);
  }

  private shadow(x: number, y: number, rx: number, ry: number, alpha: number): void {
    const p = this.cam.project(x, y);
    if (p.hidden) return;
    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y, rx * p.k, ry * p.k, 0, 0, Math.PI * 2); this.ctx.fill();
  }

  private markings(): void {
    const { ctx } = this, c = CENTRE_Y;
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    this.line([[0, 0], [PITCH_W, 0], [PITCH_W, PITCH_H], [0, PITCH_H], [0, 0]]);
    this.line([[PITCH_W / 2, 0], [PITCH_W / 2, PITCH_H]]);
    this.arc(PITCH_W / 2, c, 9.15, 0, Math.PI * 2);
    for (const side of [0, 1]) {
      const gx = side ? PITCH_W : 0, dir = side ? -1 : 1;
      this.line([[gx, c - 20.16], [gx + dir * 16.5, c - 20.16], [gx + dir * 16.5, c + 20.16], [gx, c + 20.16]]);
      this.line([[gx, c - 9.16], [gx + dir * 5.5, c - 9.16], [gx + dir * 5.5, c + 9.16], [gx, c + 9.16]]);
      this.arc(gx + dir * 11, c, 9.15, side ? Math.PI - 0.93 : -0.93, side ? Math.PI + 0.93 : 0.93);
      this.arc(gx + dir * 11, c, 0.2, 0, Math.PI * 2);
    }
  }

  private goal(side: 0 | 1, half: 'far' | 'near'): void {
    const { ctx } = this;
    const gx = side ? PITCH_W : 0, back = side ? PITCH_W + GOAL_D : -GOAL_D;
    const y0 = CENTRE_Y - GOAL_W / 2, y1 = CENTRE_Y + GOAL_W / 2, top = GOAL_H * 0.8;
    ctx.lineWidth = 1;
    if (half === 'far') {
      this.poly([[back, y0, 0], [back, y1, 0], [back, y1, top], [back, y0, top]], 'rgba(255,255,255,0.08)', NET);
      this.poly([[gx, y0, GOAL_H], [back, y0, top], [back, y1, top], [gx, y1, GOAL_H]], 'rgba(255,255,255,0.06)', NET);
      this.poly([[gx, y0, 0], [back, y0, 0], [back, y0, top], [gx, y0, GOAL_H]], 'rgba(255,255,255,0.08)', NET);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
      this.line([[gx, y0, 0], [gx, y0, GOAL_H], [gx, y1, GOAL_H]]);
    } else {
      this.poly([[gx, y1, 0], [back, y1, 0], [back, y1, top], [gx, y1, GOAL_H]], 'rgba(255,255,255,0.08)', NET);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
      this.line([[gx, y1, 0], [gx, y1, GOAL_H]]);
    }
    ctx.lineWidth = 2;
  }

  private ball(m: Match): void {
    const b = m.ball, p = this.cam.project(b.x, b.y, b.z + BALL_R);
    if (p.hidden) return;
    const { ctx } = this;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, BALL_R * p.k), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
