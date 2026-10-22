import './style.css';
import { DT } from './config';
import { Input } from './input/input';
import { type Anim, createAnim, startKick, stepAnim } from './render/figure';
import { Renderer } from './render/renderer';
import { Match } from './sim/match';
import type { Player } from './sim/player';

const canvas = document.querySelector<HTMLCanvasElement>('#pitch')!;
const $home = document.querySelector<HTMLElement>('#score-home')!;
const $away = document.querySelector<HTMLElement>('#score-away')!;
const $device = document.querySelector<HTMLElement>('#device')!;
const $help = document.querySelector<HTMLElement>('#help')!;

// `#demo` lets the AI play both sides (attract mode, and handy for tuning).
const match = new Match(Math.random, location.hash !== '#demo');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const anims = new Map<Player, Anim>(match.players.map((p) => [p, createAnim()]));
const overlay = { message: '', messageT: 0 };

input.onCameraButton = () => renderer.cam.cycle();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') renderer.cam.cycle();
  if (e.code === 'KeyH') setHelp($help.hidden);
});
const $showHelp = document.querySelector<HTMLElement>('#show-help')!;
const setHelp = (open: boolean) => { $help.hidden = !open; $showHelp.hidden = open; canvas.focus(); };
document.querySelector('#hide-help')!.addEventListener('click', () => setHelp(false));
$showHelp.addEventListener('click', () => setHelp(true));

let last = performance.now(), acc = 0;
function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  const me = match.controlled;
  const actions = input.read(me, (sx, sy) =>
    renderer.cam.toWorld(sx, sy) ?? { x: me.x + (sx > canvas.clientWidth / 2 ? 50 : -50), y: me.y - 50 });

  while (acc >= DT) { // fixed 120 Hz simulation, decoupled from the display refresh rate
    for (const e of match.step(actions, DT)) {
      if (e.type === 'message') { overlay.message = e.text; overlay.messageT = 1.4; }
      if (e.type === 'kick') {
        startKick(anims.get(e.player)!, e.power);
        if (e.human) input.rumble(0.3 + 0.6 * e.power, 60 + 80 * e.power);
      }
    }
    for (const p of match.players) {
      const charging = p.chargeKind ? p.charge : 0;
      stepAnim(anims.get(p)!, p.vx, p.vy, p.fx, p.fy, DT, charging);
    }
    overlay.messageT = Math.max(0, overlay.messageT - DT);
    acc -= DT;
  }

  $home.textContent = String(match.score[0]);
  $away.textContent = String(match.score[1]);
  $device.textContent = input.device === 'pad' ? 'Controller' : 'Keyboard + mouse';
  renderer.draw(match, anims, overlay);
  requestAnimationFrame(frame);
}
canvas.focus();
requestAnimationFrame(frame);
