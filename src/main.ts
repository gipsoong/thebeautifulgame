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
const LEVELS = [0.92, 1, 1.06, 1]; // CPU skill for Easy, Normal, Hard; the last choice is two players
const TWO_PLAYER = 3;
const $twoP = document.querySelector<HTMLElement>('#two-p')!;
const $menu = document.querySelector<HTMLElement>('#menu')!;
const $levels = [...document.querySelectorAll<HTMLElement>('[data-level]')];
let level = 1;
try { level = Number(localStorage.getItem('tbg-level') ?? 1) || 0; } catch { /* storage blocked */ }
// The menu sits over an AI-vs-AI match until the player kicks off.
let inMenu = !demo;
let match = new Match(Math.random, 0);
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
  match = new Match(Math.random, demo || inMenu ? 0 : level === TWO_PLAYER ? 2 : 1, LEVELS[level]);
  anims = new Map(match.players.map((p) => [p, createAnim()]));
  $fulltime.hidden = true;
  canvas.focus();
}
function setLevel(l: number): void {
  level = Math.max(0, Math.min(LEVELS.length - 1, l));
  $levels.forEach((b, i) => b.setAttribute('aria-checked', String(i === level)));
  $twoP.hidden = level !== TWO_PLAYER;
  try { localStorage.setItem('tbg-level', String(level)); } catch { /* storage blocked */ }
}
const $paused = document.querySelector<HTMLElement>('#paused')!;
let paused = false;
function setPaused(on: boolean): void {
  paused = on && !inMenu && !match.over;
  $paused.hidden = !paused;
  document.querySelector('#paused-score')!.textContent = `Home ${match.score[0]} – ${match.score[1]} Away`;
  canvas.focus();
}
function openMenu(): void { setPaused(false); inMenu = true; $menu.hidden = false; newMatch(); }
function kickOff(): void { inMenu = false; $menu.hidden = true; newMatch(); }
setLevel(level);
$menu.hidden = !inMenu;
$levels.forEach((b, i) => b.addEventListener('click', () => setLevel(i)));
document.querySelector('#kickoff')!.addEventListener('click', kickOff);
document.querySelector('#again')!.addEventListener('click', newMatch);
document.querySelector('#to-menu')!.addEventListener('click', openMenu);
document.querySelector('#resume')!.addEventListener('click', () => setPaused(false));
document.querySelector('#quit')!.addEventListener('click', openMenu);
input.onPauseButton = () => setPaused(!paused);
addEventListener('blur', () => setPaused(true)); // tabbing away stops the clock
const overlay = { message: '', messageT: 0 };

input.onCameraButton = () => renderer.cam.cycle();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') renderer.cam.cycle();
  if (inMenu) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') setLevel(level - 1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') setLevel(level + 1);
    if (e.code === 'Enter') { e.preventDefault(); kickOff(); }
    return;
  }
  if (paused) {
    if (e.code === 'Escape' || e.code === 'KeyP') setPaused(false);
    if (e.code === 'KeyQ') openMenu();
    return;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !match.over) { setPaused(true); return; }
  if (e.code === 'Enter' && match.over) newMatch();
  if (e.code === 'Escape' && match.over) openMenu();
  if (e.code === 'KeyM') { sound.toggleMute(); showSound(); }
  if (e.code === 'KeyH') setHelp($help.hidden);
});
const $showHelp = document.querySelector<HTMLElement>('#show-help')!;
const setHelp = (open: boolean) => { $help.hidden = !open; $showHelp.hidden = open; canvas.focus(); };
document.querySelector('#hide-help')!.addEventListener('click', () => setHelp(false));
$showHelp.addEventListener('click', () => setHelp(true));

let last = performance.now(), acc = 0, overAt = 0, padX = 0, padA = true;
function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  const me = match.controlled[0];
  const toWorld = (sx: number, sy: number) =>
    renderer.cam.toWorld(sx, sy) ?? { x: me.x + (sx > canvas.clientWidth / 2 ? 50 : -50), y: me.y - 50 };
  const [actions, away] = match.humans === 2 ? input.read2(me, toWorld) : [input.read(me, toWorld), undefined];

  if (paused) {
    acc = 0;
    if (input.device === 'pad' && actions.shoot) openMenu(); // B / Circle
  }
  while (acc >= DT) { // fixed 120 Hz simulation, decoupled from the display refresh rate
    for (const e of match.step(actions, DT, away)) {
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
        if (e.human) input.rumble(0.3 + 0.6 * e.power, 60 + 80 * e.power, match.humans === 2 ? e.player.team : undefined);
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

  if (input.device === 'pad') { // menu navigation on the pad: stick to choose, A to start
    const x = Math.round(actions.mx);
    if (inMenu && x !== padX && x !== 0) setLevel(level + x);
    if (inMenu && actions.pass && !padA) kickOff();
    padX = x; padA = actions.pass;
  }
  if (match.over && $fulltime.hidden && !inMenu) {
    overAt = now;
    $result.textContent = `Home ${match.score[0]} – ${match.score[1]} Away`;
    $fulltime.hidden = false;
    if (demo) setTimeout(newMatch, 5000);
  }
  if (inMenu && match.over) newMatch();
  if (input.device === 'pad') sound.start(); // a pad press counts as the user gesture that unlocks audio
  if (match.over && !inMenu && now - overAt > 1500) { // A / Cross or B / Circle on the pad
    if (actions.pass) newMatch();
    else if (actions.shoot) openMenu();
  }
  const mins = Math.floor(match.clock / 60) + (match.period === 'second half' || match.period === 'full-time' ? 45 : 0);
  const secs = Math.floor(match.clock % 60);
  $clock.textContent = match.period === 'half-time' ? 'HT' : match.period === 'full-time' ? 'FT' : `${mins}:${String(secs).padStart(2, '0')}`;
  $home.textContent = String(match.score[0]);
  $away.textContent = String(match.score[1]);
  $device.textContent = match.humans === 2 ? '2 players' : input.device === 'pad' ? 'Controller' : 'Keyboard + mouse';
  renderer.draw(match, anims, overlay);
  requestAnimationFrame(frame);
}
canvas.focus();
requestAnimationFrame(frame);
