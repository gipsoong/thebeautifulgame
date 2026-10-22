import './style.css';
import { DT } from './config';
import { Sound } from './audio/sound';
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
const $clock = document.querySelector<HTMLElement>('#clock')!;
const $fulltime = document.querySelector<HTMLElement>('#fulltime')!;
const $result = document.querySelector<HTMLElement>('#result')!;

// `#demo` lets the AI play both sides (attract mode, and handy for tuning).
const demo = location.hash === '#demo';
let match = new Match(Math.random, !demo);
let anims = new Map<Player, Anim>(match.players.map((p) => [p, createAnim()]));
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
const $sound = document.querySelector<HTMLElement>('#sound')!;
const showSound = () => { $sound.textContent = sound.muted ? 'Sound off (M)' : 'Sound on (M)'; };
showSound();
$sound.addEventListener('click', () => { sound.toggleMute(); showSound(); canvas.focus(); });

/** The crowd gets louder as the ball nears either goal. */
function excitement(): number {
  const b = match.ball, d = Math.min(Math.hypot(b.x, b.y - 34), Math.hypot(105 - b.x, b.y - 34));
  return match.restart || match.period !== 'first half' && match.period !== 'second half' ? 0 : Math.max(0, (30 - d) / 30) ** 1.5;
}

function newMatch(): void {
  match = new Match(Math.random, !demo);
  anims = new Map(match.players.map((p) => [p, createAnim()]));
  $fulltime.hidden = true;
  canvas.focus();
}
document.querySelector('#again')!.addEventListener('click', newMatch);
const overlay = { message: '', messageT: 0 };

input.onCameraButton = () => renderer.cam.cycle();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') renderer.cam.cycle();
  if (e.code === 'Enter' && match.over) newMatch();
  if (e.code === 'KeyM') { sound.toggleMute(); showSound(); }
  if (e.code === 'KeyH') setHelp($help.hidden);
});
const $showHelp = document.querySelector<HTMLElement>('#show-help')!;
const setHelp = (open: boolean) => { $help.hidden = !open; $showHelp.hidden = open; canvas.focus(); };
document.querySelector('#hide-help')!.addEventListener('click', () => setHelp(false));
$showHelp.addEventListener('click', () => setHelp(true));

let last = performance.now(), acc = 0, overAt = 0;
function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  const me = match.controlled;
  const actions = input.read(me, (sx, sy) =>
    renderer.cam.toWorld(sx, sy) ?? { x: me.x + (sx > canvas.clientWidth / 2 ? 50 : -50), y: me.y - 50 });

  while (acc >= DT) { // fixed 120 Hz simulation, decoupled from the display refresh rate
    for (const e of match.step(actions, DT)) {
      if (e.type === 'message') {
        overlay.message = e.text; overlay.messageT = 1.4;
        if (e.text === 'Off the post!') sound.post();
        if (e.text === 'Foul!' || e.text === 'Offside' || e.text === 'Penalty!') sound.whistle('short');
      }
      if (e.type === 'goal') { sound.goal(); sound.whistle('short'); }
      if (e.type === 'whistle') sound.whistle(e.period === 'full-time' ? 'end' : e.period === 'half-time' ? 'long' : 'short');
      if (e.type === 'kick') {
        sound.kick(e.power);
        startKick(anims.get(e.player)!, e.power);
        if (e.human) input.rumble(0.3 + 0.6 * e.power, 60 + 80 * e.power);
      }
    }
    for (const p of match.players) {
      const charging = p.chargeKind ? p.charge : 0;
      stepAnim(anims.get(p)!, p.vx, p.vy, p.fx, p.fy, DT, charging);
    }
    overlay.messageT = Math.max(0, overlay.messageT - DT);
    sound.setExcitement(excitement(), DT);
    acc -= DT;
  }

  if (match.over && $fulltime.hidden) {
    overAt = now;
    $result.textContent = `Home ${match.score[0]} – ${match.score[1]} Away`;
    $fulltime.hidden = false;
    if (demo) setTimeout(newMatch, 5000);
  }
  if (input.device === 'pad') sound.start(); // a pad press counts as the user gesture that unlocks audio
  if (match.over && actions.pass && now - overAt > 1500) newMatch(); // A / Cross on the pad
  const mins = Math.floor(match.clock / 60) + (match.period === 'second half' || match.period === 'full-time' ? 45 : 0);
  const secs = Math.floor(match.clock % 60);
  $clock.textContent = match.period === 'half-time' ? 'HT' : match.period === 'full-time' ? 'FT' : `${mins}:${String(secs).padStart(2, '0')}`;
  $home.textContent = String(match.score[0]);
  $away.textContent = String(match.score[1]);
  $device.textContent = input.device === 'pad' ? 'Controller' : 'Keyboard + mouse';
  renderer.draw(match, anims, overlay);
  requestAnimationFrame(frame);
}
canvas.focus();
requestAnimationFrame(frame);
