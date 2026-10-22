import type { Ball } from './sim/ball';
import type { Match } from './sim/match';
import type { Player } from './sim/player';

interface PlayerFrame { p: Player; x: number; y: number; vx: number; vy: number; fx: number; fy: number; state: Player['state'] }
interface Frame { ball: Ball; players: PlayerFrame[] }

const KEEP = 4 * 120; // seconds of history at the 120 Hz step rate

/**
 * Records the last few seconds of a match and plays them back after a goal.
 * Playback writes recorded positions into the live (frozen) match objects and puts the
 * real state back when it ends, so the renderer needs no replay-specific path.
 */
export class Replay {
  private frames: Frame[] = [];
  private saved: Frame | null = null;
  private clip: Frame[] = [];
  private t = 0;

  get playing(): boolean { return this.saved !== null; }

  record(m: Match): void {
    this.frames.push(snapshot(m));
    if (this.frames.length > KEEP) this.frames.shift();
  }

  clear(): void { this.frames = []; }

  start(m: Match): void {
    if (this.frames.length < 120) return;
    this.clip = this.frames;
    this.frames = [];
    this.saved = snapshot(m);
    this.t = 0;
  }

  /** Advances playback by `dt` real seconds (in slow motion). Returns false once it has finished. */
  step(m: Match, dt: number, speed = 0.6): boolean {
    if (!this.saved) return false;
    this.t += dt * speed * 120;
    const f = this.clip[Math.floor(this.t)];
    if (!f) { this.stop(m); return false; }
    apply(m, f);
    return true;
  }

  stop(m: Match): void {
    if (!this.saved) return;
    apply(m, this.saved);
    this.saved = null;
    this.clip = [];
  }
}

function snapshot(m: Match): Frame {
  return {
    ball: { ...m.ball },
    players: m.players.map((p) => ({ p, x: p.x, y: p.y, vx: p.vx, vy: p.vy, fx: p.fx, fy: p.fy, state: p.state })),
  };
}

function apply(m: Match, f: Frame): void {
  Object.assign(m.ball, f.ball);
  for (const { p, ...s } of f.players) Object.assign(p, s);
}
