import { type Vec2, norm } from '../math';
import type { Actions } from './actions';

export type Device = 'kbm' | 'pad';

const DEADZONE = 0.18;
// Gamepad API "standard" mapping: https://w3c.github.io/gamepad/#remapping
const BTN = { A: 0, B: 1, X: 2, RB: 5, RT: 7, VIEW: 8 } as const;

/**
 * Merges keyboard + mouse and gamepad into one Actions value per frame.
 * Whichever device was touched last is active.
 */
export class Input {
  device: Device = 'kbm';
  onCameraButton: () => void = () => {};
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, l: false, r: false, lastMove: -Infinity };
  private padIndex: number | null = null;
  private viewHeld = false;
  private pad: Gamepad | null = null;

  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.device = 'kbm';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousemove', (e) => {
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; this.mouse.lastMove = performance.now(); this.device = 'kbm';
    });
    el.addEventListener('mousedown', (e) => {
      el.focus();
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
      this.device = 'kbm';
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
    addEventListener('gamepaddisconnected', (e) => {
      if (this.padIndex === e.gamepad.index) this.padIndex = null;
      this.device = 'kbm';
    });
  }

  /** `toWorld` maps a screen point to the pitch, so the mouse can aim through the perspective camera. */
  read(playerPos: Vec2, toWorld: (sx: number, sy: number) => Vec2): Actions {
    const pad = this.readPad();
    if (this.device === 'pad' && pad) return pad;

    const k = this.keys;
    let mx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    let my = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'));
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
    let aim: Vec2 | null = null;
    const m = this.mouse;
    if (performance.now() - m.lastMove < 4000 || m.l || m.r) {
      const w = toWorld(m.x, m.y);
      aim = norm(w.x - playerPos.x, w.y - playerPos.y);
    } else if (mx || my) aim = norm(mx, my);
    return {
      mx, my, aim,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      pass: m.r || k.has('KeyJ'),
      shoot: m.l || k.has('KeyK'),
      lob: k.has('KeyE') || k.has('KeyL'),
    };
  }

  /** Rumble on the active pad; silently does nothing where unsupported (Firefox, Safari). */
  rumble(strength: number, ms: number): void {
    try {
      void this.pad?.vibrationActuator?.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6,
      });
    } catch { /* optional */ }
  }

  private readPad(): Actions | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = this.padIndex !== null ? pads[this.padIndex] : pads.find((p) => p) ?? null;
    this.pad = gp ?? null;
    if (!gp) return null;
    let x = gp.axes[0] ?? 0, y = gp.axes[1] ?? 0;
    const mag = Math.hypot(x, y);
    if (mag < DEADZONE) { x = y = 0; } else { // radial deadzone, rescaled so movement starts from zero
      const s = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag; x *= s; y *= s;
    }
    const b = (i: number) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3);
    const view = b(BTN.VIEW);
    if (view && !this.viewHeld) this.onCameraButton();
    this.viewHeld = view;
    const a: Actions = {
      mx: x, my: y, aim: x || y ? norm(x, y) : null,
      sprint: b(BTN.RT) || b(BTN.RB), pass: b(BTN.A), shoot: b(BTN.B), lob: b(BTN.X),
    };
    if (x || y || a.pass || a.shoot || a.lob || a.sprint) this.device = 'pad';
    return a;
  }
}
