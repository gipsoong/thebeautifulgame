import './style.css';
import { DT } from './config';
import { Input } from './input/input';
import { createAnim, startKick, stepAnim } from './render/figure';
import { Renderer } from './render/renderer';
import { Match } from './sim/match';

const canvas = document.querySelector<HTMLCanvasElement>('#pitch')!;
const $score = document.querySelector<HTMLElement>('#score')!;
const $device = document.querySelector<HTMLElement>('#device')!;
const $stats = document.querySelector<HTMLElement>('#stats')!;
const $help = document.querySelector<HTMLElement>('#help')!;

const match = new Match();
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const anims = { player: createAnim(), keeper: createAnim() };
const overlay = { message: '', messageT: 0 };

input.onCameraButton = () => renderer.cam.cycle();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') renderer.cam.cycle();
  if (e.code === 'KeyH') $help.hidden = !$help.hidden;
});
document.querySelector('#hide-help')!.addEventListener('click', () => { $help.hidden = true; canvas.focus(); });

let last = performance.now(), acc = 0;
function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  const { player, keeper, ball } = match;
  const actions = input.read(player, (sx, sy) =>
    renderer.cam.toWorld(sx, sy) ?? { x: player.x + (sx > canvas.clientWidth / 2 ? 50 : -50), y: player.y - 50 });

  while (acc >= DT) { // fixed 120 Hz simulation, decoupled from the display refresh rate
    for (const e of match.step(actions, DT)) {
      if (e.type === 'message') { overlay.message = e.text; overlay.messageT = 1.4; }
      if (e.type === 'kick') { startKick(anims.player, e.power); input.rumble(0.3 + 0.6 * e.power, 60 + 80 * e.power); }
    }
    stepAnim(anims.player, player.vx, player.vy, player.fx, player.fy, DT, player.chargeKind ? player.charge : 0);
    stepAnim(anims.keeper, 0, keeper.vy, -1, 0, DT, 0);
    overlay.messageT = Math.max(0, overlay.messageT - DT);
    acc -= DT;
  }

  $score.textContent = String(match.goals);
  $device.textContent = input.device === 'pad' ? 'Controller' : 'Keyboard + mouse';
  $stats.textContent =
    `player ${Math.hypot(player.vx, player.vy).toFixed(1).padStart(4)} m/s\n` +
    `ball   ${(Math.hypot(ball.vx, ball.vy) * 3.6).toFixed(0).padStart(4)} km/h\n` +
    `height ${ball.z.toFixed(1).padStart(4)} m`;
  renderer.draw(match, anims, overlay);
  requestAnimationFrame(frame);
}
canvas.focus();
requestAnimationFrame(frame);
