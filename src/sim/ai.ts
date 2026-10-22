import { BOUNCE, CENTRE_Y, G, GK_SPEED, GOAL_W, PITCH_H, PITCH_W, SPRINT } from '../config';
import { NO_ACTIONS, type Actions } from '../input/actions';
import { type Vec2, clamp, norm } from '../math';
import type { Ball } from './ball';
import { leadTarget, lobPowerFor, passPowerFor, passSpeedFor } from './kick';
import { keeperTarget, shotCrossingY, startDive } from './keeper';
import { type Player, queueKick } from './player';
import { offsidePlayers } from './rules';
import { type TeamId, attackDir, oppGoalX, ownGoalX } from './team';

/** What the AI sees each step. Built by the match. */
export interface AIContext {
  ball: Ball;
  players: Player[];
  possession: TeamId | null; // team in control, null when the ball is loose
  carrier: Player | null; // player with the ball at their feet
  chasers: [Player | null, Player | null]; // per team, the outfield player sent to the ball
  passTarget: Player | null; // intended receiver of the pass in flight
  sinceKick: number; // seconds since the ball was last struck
  rng: () => number;
}

export interface Decision {
  actions: Actions;
  tackle: 'stand' | 'slide' | null;
  passTo: Player | null; // set when this player just queued a pass
}

const decide = (actions: Actions, tackle: Decision['tackle'] = null, passTo: Player | null = null): Decision =>
  ({ actions, tackle, passTo });

/** Runs towards a point, easing off on arrival (unless chasing the ball); sprints when far. */
export function steer(p: Player, to: Vec2, sprintBeyond = 6, ease = true): Actions {
  const dx = to.x - p.x, dy = to.y - p.y, d = Math.hypot(dx, dy);
  if (d < (ease ? 0.3 : 0.05)) return { ...NO_ACTIONS };
  const m = ease ? Math.min(1, d / 1.5) : 1;
  // Getting back into shape is not worth emptying the tank for; chasing the ball is.
  const sprint = d > sprintBeyond && (sprintBeyond < 6 || p.stamina > 0.5);
  return { ...NO_ACTIONS, mx: (dx / d) * m, my: (dy / d) * m, sprint };
}

/** Roughly where and when this player can first reach the moving ball. */
export function intercept(p: Player, ball: Ball): { at: Vec2; t: number } {
  const speed = p.role === 'GK' ? GK_SPEED : SPRINT;
  let bx = ball.x, by = ball.y, bz = ball.z, vx = ball.vx, vy = ball.vy, vz = ball.vz;
  for (let t = 0; t < 3; t += 0.1) {
    // Only a ball low enough to head or chest down can be met; a lob is met where it comes down.
    if (bz < 2.2 && Math.hypot(bx - p.x, by - p.y) <= speed * t + 0.6) return { at: { x: bx, y: by }, t };
    bx += vx * 0.1; by += vy * 0.1;
    if (bz > 0 || vz > 0) { // rough flight: gravity and a damped bounce, no drag
      bz += vz * 0.1; vz -= G * 0.1;
      if (bz <= 0) { bz = 0; vz = vz < -1.2 ? -vz * BOUNCE : 0; }
    } else {
      const s = Math.hypot(vx, vy), ns = Math.max(0, s - 0.24);
      if (s > 0) { vx *= ns / s; vy *= ns / s; }
    }
  }
  return { at: { x: bx, y: by }, t: 3 + Math.hypot(bx - p.x, by - p.y) / speed };
}

/** Formation slot shifted with the ball: the block slides up, down and across as one. */
export function slotTarget(p: Player, ctx: AIContext): Vec2 {
  const { ball } = ctx, dir = attackDir(p.team), own = ownGoalX(p.team);
  const ballProg = clamp(((ball.x - own) * dir) / PITCH_W, 0, 1);
  const attacking = ctx.possession === p.team, defending = ctx.possession !== null && !attacking;
  let fx = p.slot.x * 0.6 + ballProg * 0.4 + (attacking ? 0.08 : defending ? -0.06 : 0);
  if (defending && (p.role === 'DEF' || p.role === 'MID')) fx = Math.min(fx, ballProg - 0.04); // stay goal-side
  fx = clamp(fx, 0.06, 0.9);
  const width = attacking ? 1 : 0.75;
  return {
    x: own + dir * fx * PITCH_W,
    y: clamp(CENTRE_Y + (p.slot.y - 0.5) * PITCH_H * width + (ball.y - CENTRE_Y) * 0.35, 3, PITCH_H - 3),
  };
}

/** Pressing: close down the ball from the goal side, near enough to tackle. */
export function pressTarget(p: Player, carrier: Player, ball: Ball): Vec2 {
  const g = norm(ownGoalX(p.team) - carrier.x, CENTRE_Y - carrier.y);
  return { x: ball.x + g.x * 0.7, y: ball.y + g.y * 0.7 };
}

export function think(p: Player, ctx: AIContext, dt: number): Decision {
  p.aiT -= dt;
  const { ball, carrier } = ctx;
  if (p.role === 'GK' && carrier === p) return keeperDistribute(p, ctx);
  if (p.role === 'GK') return keeperBrain(p, ctx);
  if (carrier === p) return carrierBrain(p, ctx, dt);
  if (ctx.passTarget === p) return decide(steer(p, intercept(p, ball).at, 3, false));
  if (ctx.chasers[p.team] === p && ctx.possession !== p.team) {
    if (carrier && carrier.team !== p.team) return pressBrain(p, carrier, ctx);
    return decide(steer(p, intercept(p, ball).at, 2, false));
  }
  if (p.role === 'FWD' && ctx.possession === p.team) return decide(forwardRun(p, ctx, dt));
  if (ctx.possession === p.team && carrier) return decide(steer(p, getOpen(p, slotTarget(p, ctx), carrier, ctx), 8));
  return decide(steer(p, slotTarget(p, ctx), 8));
}

/**
 * Off the ball in possession: drift out of the nearest marker's reach and out of any
 * opponent standing in the passing lane from the carrier, so there is a ball to be played.
 */
export function getOpen(p: Player, slot: Vec2, carrier: Player, ctx: AIContext): Vec2 {
  let x = slot.x, y = slot.y;
  for (const o of ctx.players) {
    if (o.team === p.team || o.role === 'GK') continue;
    const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < 5) { x += (dx / d) * (5 - d) * 0.8; y += (dy / d) * (5 - d) * 0.8; }
    // Step sideways off a lane he is blocking.
    const lane = norm(x - carrier.x, y - carrier.y), u = (o.x - carrier.x) * lane.x + (o.y - carrier.y) * lane.y;
    const side = (o.x - carrier.x) * -lane.y + (o.y - carrier.y) * lane.x;
    if (u > 2 && u < Math.hypot(x - carrier.x, y - carrier.y) - 1 && Math.abs(side) < 1.5) {
      const s = side >= 0 ? -1 : 1, k = 1.5 - Math.abs(side);
      x += -lane.y * s * k; y += lane.x * s * k;
    }
  }
  return { x: clamp(x, 2, PITCH_W - 2), y: clamp(y, 2, PITCH_H - 2) };
}

/** The opponents' deepest outfield player, i.e. their defensive line. */
function lastLineX(team: TeamId, ctx: AIContext): number {
  const dir = attackDir(team);
  let line = PITCH_W / 2;
  for (const o of ctx.players) if (o.team !== team && o.role !== 'GK') line = dir > 0 ? Math.max(line, o.x) : Math.min(line, o.x);
  return line;
}

/** Strikers play on the shoulder of the last defender and now and then spin in behind. */
function forwardRun(p: Player, ctx: AIContext, dt: number): Actions {
  const dir = attackDir(p.team), line = lastLineX(p.team, ctx), slot = slotTarget(p, ctx);
  p.runT = Math.max(0, p.runT - dt);
  const c = ctx.carrier;
  if (p.runT === 0 && c && c !== p && p.aiT <= 0) {
    p.aiT = 0.5;
    if ((p.x - c.x) * dir > 0 && Math.hypot(p.x - c.x, p.y - c.y) < 40 && ctx.rng() < 0.25) p.runT = 1.6;
  }
  // Hold the line until the run, then go: a pass played into his path before he crosses it is onside.
  const x = p.runT > 0 ? line + dir * 9 : line - dir * 1.5;
  const target = { x: dir > 0 ? Math.max(slot.x, Math.min(x, PITCH_W - 6)) : Math.min(slot.x, Math.max(x, 6)), y: slot.y };
  return steer(p, target, p.runT > 0 ? 0 : 6);
}

function pressBrain(p: Player, carrier: Player, ctx: AIContext): Decision {
  const { ball, rng } = ctx;
  const a = steer(p, pressTarget(p, carrier, ball), 3);
  const d = Math.hypot(ball.x - p.x, ball.y - p.y);
  if (d < 1.3 && p.aiT <= 0) {
    p.aiT = 0.3;
    if (rng() < 0.35) return decide(a, 'stand');
    const away = carrier.vx * (carrier.x - p.x) + carrier.vy * (carrier.y - p.y) > 0;
    if (away && rng() < 0.05) return decide(a, 'slide');
  }
  return decide(a);
}

function keeperBrain(gk: Player, ctx: AIContext): Decision {
  const { ball } = ctx, own = ownGoalX(gk.team);
  const inBox = Math.abs(ball.x - own) < 16.5 && Math.abs(ball.y - CENTRE_Y) < 20.16;
  if (inBox && ctx.possession === null && ctx.chasers[gk.team] === gk) {
    return decide(steer(gk, intercept(gk, ball).at, 0, false));
  }
  // Reaction time: a keeper can't start moving to a shot the instant it is struck.
  if (ctx.sinceKick < 0.22 / gk.skill ** 2 && shotCrossingY(gk, ball) !== null) return decide({ ...NO_ACTIONS });
  if (startDive(gk, ball)) return decide({ ...NO_ACTIONS });
  const t = keeperTarget(gk, ball);
  return decide(steer(gk, t, 1.5));
}

/** Keeper with the ball at his feet: find a teammate, or clear it long. */
function keeperDistribute(gk: Player, ctx: AIContext): Decision {
  if (gk.buffered || gk.aiT > 0) return decide({ ...NO_ACTIONS });
  gk.aiT = 0.4;
  const best = bestPass(gk, ctx);
  if (best) { playPass(gk, best); return decide({ ...NO_ACTIONS }, null, best.r); }
  queueKick(gk, 'lob', 0.85, { x: attackDir(gk.team), y: 0 });
  return decide({ ...NO_ACTIONS });
}

/** Lane margin (m) below which a ground pass is not tried: slightly negative, as players do risk it. */
const RISKY = -0.5;

interface PassOption { r: Player; to: Vec2; score: number; dist: number; open: number; gain: number }

function segmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby || 1;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/**
 * How far an opponent is from being able to cut out a ground pass from `a` to `b`, in metres:
 * his distance from the lane minus the ground he can cover before the ball gets there.
 */
function laneMargin(o: Vec2, a: Vec2, b: Vec2, ballSpeed: number): number {
  const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby || 1;
  const u = clamp(((o.x - a.x) * abx + (o.y - a.y) * aby) / l2, 0, 1);
  const t = (u * Math.sqrt(l2)) / ballSpeed;
  return Math.hypot(o.x - (a.x + abx * u), o.y - (a.y + aby * u)) - (0.45 * SPRINT * Math.max(0, t - 0.35) + 0.7);
}

/** Scores every teammate: forward progress, a clear lane and space around him. */
export function bestPass(p: Player, ctx: AIContext, allowKeeper = false): PassOption | null {
  const dir = attackDir(p.team);
  const opps = ctx.players.filter((o) => o.team !== p.team && o.state !== 'down');
  let best: PassOption | null = null;
  const offside = offsidePlayers(p, ctx.players, ctx.ball);
  for (const t of ctx.players) {
    if (t === p || t.team !== p.team || t.state === 'down' || (t.role === 'GK' && !allowKeeper) || offside.has(t)) continue;
    // Judge the pass where it will actually go: into the runner's path.
    const to = leadTarget(p, t, passSpeedFor(Math.hypot(t.x - p.x, t.y - p.y)));
    const dist = Math.hypot(to.x - p.x, to.y - p.y);
    if (dist < 5 || dist > 45) continue;
    let open = 6, marked = 6;
    const speed = passSpeedFor(dist);
    for (const o of opps) {
      open = Math.min(open, laneMargin(o, p, to, speed));
      marked = Math.min(marked, Math.hypot(o.x - to.x, o.y - to.y));
    }
    // A blocked lane is only an option when the ball can go over it to a free man.
    if (open <= RISKY && (dist < 18 || marked < 3)) continue;
    const gain = (to.x - p.x) * dir; // metres of progress towards goal
    const toGoal = Math.hypot(oppGoalX(p.team) - to.x, CENTRE_Y - to.y);
    const score = gain * 0.1 + (open > RISKY ? Math.min(open, 3) * 0.3 : -0.6) + marked * 0.2 - dist * 0.02 + Math.max(0, 35 - toGoal) * 0.04;
    if (!best || score > best.score) best = { r: t, to, score, dist, open, gain };
  }
  return best;
}

/** Plays the pass to `o`: along the ground if the lane is clear, chipped if it is long and blocked. */
export function playPass(p: Player, o: PassOption): void {
  const tgt = o.to;
  const d = Math.hypot(tgt.x - p.x, tgt.y - p.y), aim = norm(tgt.x - p.x, tgt.y - p.y);
  if (o.open <= RISKY) queueKick(p, 'lob', lobPowerFor(d), aim);
  else queueKick(p, 'pass', passPowerFor(d), aim);
}

/** Walks onto the ball at a gentle pace (used to strike it). */
function approach(p: Player, ball: Ball): Actions {
  const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy) || 1;
  const m = d > 1.0 ? 1 : 0.35;
  return { ...NO_ACTIONS, mx: (dx / d) * m, my: (dy / d) * m };
}

function carrierBrain(p: Player, ctx: AIContext, dt: number): Decision {
  const { rng } = ctx, gx = oppGoalX(p.team);
  const dGoal = Math.hypot(gx - p.x, CENTRE_Y - p.y);
  const opps = ctx.players.filter((o) => o.team !== p.team && o.state !== 'down');
  let dOpp = Infinity;
  for (const o of opps) dOpp = Math.min(dOpp, Math.hypot(o.x - p.x, o.y - p.y));

  // With a kick queued, keep walking onto the ball so it fires.
  if (p.buffered) return decide(approach(p, ctx.ball));
  p.pressedT = dOpp < 3 ? p.pressedT + dt : 0;
  if (p.aiT <= 0) {
    p.aiT = 0.25 + rng() * 0.25;
    if (rng() < 0.3) p.dribbleSide = rng() < 0.5 ? 1 : -1;
    const wide = Math.abs(CENTRE_Y - p.y) > dGoal * 0.8;
    if (dGoal < 30 && !wide) {
      const gk = opps.find((o) => o.role === 'GK');
      const side = gk && gk.y > CENTRE_Y ? -1 : 1; // aim for the corner away from the keeper
      const ty = CENTRE_Y + side * (GOAL_W / 2 - 0.6 - rng() * 0.8);
      const blocked = opps.some((o) => o.role !== 'GK' && segmentDist(o, p, { x: gx, y: ty }) < 1.2);
      const chance = (dGoal < 16 ? 0.9 : dGoal < 22 ? 0.6 : 0.3) * (blocked ? 0.4 : 1);
      if (rng() < chance) {
        const placed = dGoal < 20 && rng() < 0.5; // pass it into the corner rather than blast it
        queueKick(p, 'shoot', placed ? 0.3 + rng() * 0.15 : clamp(0.45 + dGoal / 45, 0.45, 0.95), norm(gx - p.x, ty - p.y));
        return decide(approach(p, ctx.ball));
      }
    }
    const best = bestPass(p, ctx, dOpp < 2);
    const pressured = dOpp < 3;
    const crowded = p.pressedT > 1.2; // boxed in for a while: move it on rather than lose it
    if (best && ((pressured && (best.score > 0.5 || crowded)) || (best.gain > 8 && best.score > 1.6 + rng() * 0.6))) {
      playPass(p, best);
      return decide(approach(p, ctx.ball), null, best.r);
    }
  }

  // Dribble at goal. A defender in the way is taken round on whichever side he leaves open.
  const gdx = gx - p.x, gdy = CENTRE_Y - p.y, gm = Math.hypot(gdx, gdy) || 1;
  const fx = gdx / gm, fy = gdy / gm; // towards goal
  let mx = fx, my = fy, clear = true;
  for (const o of opps) {
    const ox = o.x - p.x, oy = o.y - p.y, d = Math.hypot(ox, oy);
    if (d >= 6 || d === 0) continue;
    const ahead = (ox * fx + oy * fy) / d; // 1 = straight in front
    const w = (6 - d) / 6;
    if (ahead > 0) {
      clear = clear && d > 5;
      const lateral = (ox * -fy + oy * fx) / d; // which side of our line he is on
      const side = Math.abs(lateral) > 0.5 ? -Math.sign(lateral) : p.dribbleSide;
      mx += -fy * side * w * 1.6 * ahead; my += fx * side * w * 1.6 * ahead;
    }
    mx -= (ox / d) * w * 0.5; my -= (oy / d) * w * 0.5;
  }
  // Keep away from the touchlines.
  if (p.y < 4) my += (4 - p.y) * 0.4;
  if (p.y > PITCH_H - 4) my -= (p.y - PITCH_H + 4) * 0.4;
  const n = norm(mx, my);
  // Touches knock the ball the way we run, so first get behind it relative to where we want to go.
  const { ball } = ctx, bx = ball.x - p.x, by = ball.y - p.y, bd = Math.hypot(bx, by);
  if (bd > 0.3 && (bx * n.x + by * n.y) / bd < 0.5) {
    const a = steer(p, { x: ball.x - n.x * 0.45, y: ball.y - n.y * 0.45 }, 99, bd < 1.2);
    return decide({ ...a, mx: a.mx * 0.7, my: a.my * 0.7 });
  }
  return decide({ ...NO_ACTIONS, mx: n.x, my: n.y, sprint: clear });
}
