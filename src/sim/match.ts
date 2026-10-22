import { CENTRE_Y, GK_HOLD_TIME, GOAL_H, GOAL_W, PITCH_H, PITCH_W } from '../config';
import type { Actions } from '../input/actions';
import { clamp, norm } from '../math';
import { type AIContext, bestPass, intercept, playPass, pressTarget, steer, think } from './ai';
import { type Ball, createBall, stepBall } from './ball';
import { collidePlayers, standingTackle, startSlide, stepSlide } from './contact';
import { leadTarget, lobPowerFor, passPowerFor, pickReceiver, tryKick } from './kick';
import { keeperSave } from './keeper';
import { type KickKind, type Player, createPlayer, queueKick, stepPlayer, touchBall, updateCharge } from './player';
import { FOUR_FOUR_TWO, type TeamId, attackDir, other, ownGoalX, toWorld } from './team';

export type MatchEvent =
  | { type: 'message'; text: string }
  | { type: 'kick'; kind: KickKind; power: number; player: Player; human: boolean }
  | { type: 'goal'; team: TeamId };

type RestartKind = 'kickoff' | 'throw-in' | 'goal kick' | 'corner' | 'free kick';
interface Restart { kind: RestartKind; team: TeamId; x: number; y: number; t: number }

const PASS_TIME = 2.2; // how long a pass counts as "in flight" for the receiver and his team

/** An 11-a-side match: the human controls one home player at a time, the AI runs everyone else. */
export class Match {
  players: Player[] = [];
  ball: Ball = createBall(PITCH_W / 2, CENTRE_Y);
  score: [number, number] = [0, 0];
  controlled: Player;
  lastTouch: Player | null = null;
  holder: Player | null = null; // keeper holding the ball in his hands
  passTarget: Player | null = null;
  restart: Restart | null = null;
  /** After a restart is set up, opponents keep their distance until the ball is played. */
  private awaitKick: { team: TeamId; x: number; y: number; min: number } | null = null;
  private holdT = 0;
  private passT = 0;
  private sinceKick = 0;

  /** With `humanControlled` false the AI also plays the controlled player (demo mode, tests). */
  constructor(private rng: () => number = Math.random, public humanControlled = true) {
    for (const team of [0, 1] as const) {
      FOUR_FOUR_TWO.forEach((s, i) => {
        const p = createPlayer(0, 0, team, s.role, team * FOUR_FOUR_TWO.length + i);
        p.slot = { x: s.x, y: s.y };
        this.players.push(p);
      });
    }
    this.controlled = this.players.find((p) => p.team === 0 && p.role === 'FWD')!;
    this.setRestart('kickoff', 0, PITCH_W / 2, CENTRE_Y, 0);
  }

  get carrier(): Player | null {
    const p = this.lastTouch, b = this.ball;
    if (!p || this.holder || p.state !== 'normal') return null;
    return Math.hypot(b.x - p.x, b.y - p.y) < 1.6 && b.z < 1 ? p : null;
  }

  get possession(): TeamId | null {
    if (this.restart) return this.restart.team;
    if (this.holder) return this.holder.team;
    const c = this.carrier;
    if (c) return c.team;
    if (this.passTarget && this.passT > 0) return this.passTarget.team;
    return null;
  }

  step(human: Actions, dt: number): MatchEvent[] {
    const ev: MatchEvent[] = [];
    const { ball, rng } = this;
    this.passT = Math.max(0, this.passT - dt);
    this.sinceKick += dt;
    if (this.passT === 0) this.passTarget = null;

    if (this.restart) {
      this.restart.t -= dt;
      if (this.restart.t <= 0) this.takeRestart();
    }

    const ctx = this.context();
    const carrier = this.carrier;
    const decisions = new Map<Player, { actions: Actions; tackle: 'stand' | 'slide' | null }>();
    for (const p of this.players) {
      if (p === this.controlled && this.humanControlled) decisions.set(p, this.humanDecision(p, human, ctx, dt));
      else if (p === this.holder) decisions.set(p, { actions: steer(p, p), tackle: null });
      else {
        const d = think(p, ctx, dt);
        if (d.passTo && p.buffered) p.buffered.receiver = d.passTo;
        decisions.set(p, d);
      }
    }

    // Kicks, tackles, movement, then contact with the ball.
    for (const p of this.players) {
      const r = p.buffered?.receiver, kind = p.buffered?.kind ?? 'pass';
      const power = tryKick(p, ball, dt, rng);
      if (power === null) continue;
      ev.push({ type: 'kick', kind, power, player: p, human: p === this.controlled });
      this.lastTouch = p;
      this.sinceKick = 0;
      this.awaitKick = null;
      if (this.holder === p) this.holder = null;
      this.passTarget = r ?? null;
      this.passT = r ? PASS_TIME : 0;
      if (r && p === this.controlled && r.team === 0) this.controlled = r;
    }
    for (const p of this.players) {
      const t = decisions.get(p)!.tackle;
      if (t === 'stand') {
        const res = standingTackle(p, ball, carrier, rng);
        if (res?.type === 'won') this.lastTouch = p;
        if (res?.type === 'foul') this.foul(res.on, ev);
      } else if (t === 'slide') startSlide(p);
    }
    for (const p of this.players) stepPlayer(p, ball, decisions.get(p)!.actions, dt);
    for (const p of this.players) {
      const res = stepSlide(p, ball, this.players, rng);
      if (res?.type === 'won') this.lastTouch = p;
      if (res?.type === 'foul') this.foul(res.on, ev);
    }

    if (!this.holder && !this.restart) {
      this.keepers(ev);
      // Nearest player gets the first touch.
      const order = [...this.players].sort((a, b) =>
        Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
      for (const p of order) {
        if (p.role === 'GK' && this.holder) break;
        if (touchBall(p, ball, decisions.get(p)!.actions.sprint)) {
          this.lastTouch = p;
          if (this.awaitKick && Math.hypot(ball.x - this.awaitKick.x, ball.y - this.awaitKick.y) > 0.5) this.awaitKick = null;
          if (p !== this.passTarget) { this.passTarget = null; this.passT = 0; }
          if (p.team === 0 && p !== this.controlled) this.controlled = p; // auto-switch to whoever has it
          break;
        }
      }
    }
    collidePlayers(this.players, carrier);
    if (this.awaitKick) this.keepDistance(this.awaitKick);

    if (this.holder) {
      const h = this.holder;
      Object.assign(ball, { x: h.x + h.fx * 0.35, y: h.y + h.fy * 0.35, z: 1, vx: 0, vy: 0, vz: 0, spin: 0 });
      this.holdT -= dt;
      if (this.holdT <= 0 && !h.buffered) this.distribute(h);
    } else if (stepBall(ball, dt)) ev.push({ type: 'message', text: 'Off the post!' });

    if (!this.restart) this.checkGoalAndOut(ev);
    return ev;
  }

  private context(): AIContext {
    const { ball } = this, possession = this.possession;
    const chasers: [Player | null, Player | null] = [null, null];
    if (!this.restart && !this.holder) {
      for (const team of [0, 1] as const) {
        const box = Math.abs(ball.x - ownGoalX(team)) < 16.5 && Math.abs(ball.y - CENTRE_Y) < 20.16;
        let best: Player | null = null, bestT = Infinity;
        for (const p of this.players) {
          if (p.team !== team || p.state === 'down' || (p.role === 'GK' && !box)) continue;
          const t = intercept(p, ball).t;
          if (t < bestT) { bestT = t; best = p; }
        }
        chasers[team] = best;
      }
      if (this.awaitKick) chasers[other(this.awaitKick.team)] = null;
    }
    return { ball, players: this.players, possession, carrier: this.carrier, chasers, passTarget: this.passTarget, sinceKick: this.sinceKick, rng: this.rng };
  }

  private humanDecision(p: Player, a: Actions, ctx: AIContext, dt: number) {
    const { ball } = this;
    if (a.switch && !p.held.switch) {
      const pick = this.players
        .filter((t) => t.team === 0 && t.role !== 'GK' && t !== p)
        .sort((x, y) => Math.hypot(x.x - ball.x, x.y - ball.y) - Math.hypot(y.x - ball.x, y.y - ball.y))[0];
      if (pick) { this.controlled = pick; p.chargeKind = null; p.charge = 0; }
    }
    p.held.switch = a.switch;

    const near = Math.hypot(ball.x - p.x, ball.y - p.y) < 2.5;
    const attacking = this.possession === 0 || (this.possession === null && near) || this.carrier === p;
    if (attacking) {
      updateCharge(p, a, dt);
      const k = p.buffered;
      if (k && !k.receiver && (k.kind === 'pass' || k.kind === 'lob')) { // pass assist
        const r = pickReceiver(p, k.aim ?? { x: p.fx, y: p.fy }, this.players.filter((t) => t.team === 0));
        if (r) {
          const tgt = leadTarget(p, r, k.kind === 'pass' ? 14 : 12);
          const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
          const auto = k.kind === 'pass' ? passPowerFor(d) : lobPowerFor(d);
          k.aim = norm(tgt.x - p.x, tgt.y - p.y);
          k.power = clamp(auto * (0.8 + 0.4 * k.power), 0.05, 1);
          k.receiver = r;
        }
      }
      return { actions: a, tackle: null };
    }

    // Defending: shoot = standing tackle, lob = slide, hold pass = press the carrier.
    const tackle = a.shoot && !p.held.shoot ? 'stand' as const : a.lob && !p.held.lob ? 'slide' as const : null;
    p.held.pass = a.pass; p.held.shoot = a.shoot; p.held.lob = a.lob;
    p.chargeKind = null; p.charge = 0;
    if (a.pass) {
      const c = ctx.carrier;
      const to = c && c.team !== p.team ? pressTarget(p, c, ball) : intercept(p, ball).at;
      return { actions: { ...steer(p, to, 99), sprint: a.sprint }, tackle };
    }
    return { actions: a, tackle };
  }

  private keepers(ev: MatchEvent[]): void {
    const { ball } = this;
    for (const gk of this.players) {
      if (gk.role !== 'GK') continue;
      const own = ownGoalX(gk.team);
      if (Math.abs(ball.x - own) > 16.5 || Math.abs(ball.y - CENTRE_Y) > 20.16) continue;
      const fromOpponent = this.lastTouch?.team !== gk.team;
      const res = fromOpponent ? keeperSave(gk, ball, this.rng) : null;
      const slowLoose = Math.hypot(ball.x - gk.x, ball.y - gk.y) < 0.9 && ball.z < 2 && Math.hypot(ball.vx, ball.vy) < 8 && !this.carrier;
      if (res === 'catch' || (slowLoose && fromOpponent)) {
        this.holder = gk; this.holdT = GK_HOLD_TIME; this.lastTouch = gk; this.passTarget = null;
        gk.fx = attackDir(gk.team); gk.fy = 0;
        ev.push({ type: 'message', text: res === 'catch' ? 'Saved!' : 'Gathered' });
        return;
      }
      if (res === 'parry') { this.lastTouch = gk; ev.push({ type: 'message', text: 'Saved!' }); }
    }
  }

  private distribute(gk: Player): void {
    const best = bestPass(gk, this.context());
    if (best) { playPass(gk, best); if (gk.buffered) gk.buffered.receiver = best.r; }
    else queueKick(gk, 'lob', 0.8, { x: attackDir(gk.team), y: 0 });
  }

  private foul(on: Player, ev: MatchEvent[]): void {
    ev.push({ type: 'message', text: 'Foul!' });
    this.setRestart('free kick', on.team, clamp(on.x, 1, PITCH_W - 1), clamp(on.y, 1, PITCH_H - 1));
  }

  private checkGoalAndOut(ev: MatchEvent[]): void {
    const { ball } = this, last = this.lastTouch?.team ?? 0;
    const inMouth = Math.abs(ball.y - CENTRE_Y) < GOAL_W / 2 && ball.z < GOAL_H;
    if ((ball.x > PITCH_W || ball.x < 0) && inMouth) {
      const scorer: TeamId = ball.x > PITCH_W ? 0 : 1;
      this.score[scorer]++;
      ev.push({ type: 'goal', team: scorer }, { type: 'message', text: 'GOAL!' });
      ball.vx *= 0.15; ball.vy *= 0.15; ball.vz = 0; ball.z = Math.min(ball.z, 1);
      this.setRestart('kickoff', other(scorer), PITCH_W / 2, CENTRE_Y, 2.2);
      return;
    }
    if (ball.y < 0 || ball.y > PITCH_H) {
      this.setRestart('throw-in', other(last), clamp(ball.x, 1, PITCH_W - 1), ball.y < 0 ? 0.3 : PITCH_H - 0.3);
    } else if (ball.x < 0 || ball.x > PITCH_W) {
      const side: TeamId = ball.x < 0 ? 0 : 1; // team defending this goal line
      const gx = ownGoalX(side);
      if (last === side) this.setRestart('corner', other(side), Math.abs(gx - 0.5), ball.y < CENTRE_Y ? 0.5 : PITCH_H - 0.5);
      else this.setRestart('goal kick', side, Math.abs(gx - 5.5), CENTRE_Y);
    } else return;
    ev.push({ type: 'message', text: this.restart!.kind });
  }

  private setRestart(kind: RestartKind, team: TeamId, x: number, y: number, t = 1.2): void {
    this.restart = { kind, team, x, y, t };
    this.awaitKick = null;
    this.passTarget = null; this.holder = null;
  }

  private keepDistance(k: { team: TeamId; x: number; y: number; min: number }): void {
    for (const o of this.players) {
      if (o.team === k.team) continue;
      const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy);
      if (d >= k.min) continue;
      const n = d > 0 ? norm(dx, dy) : { x: -attackDir(k.team), y: 0 };
      o.x = k.x + n.x * k.min; o.y = k.y + n.y * k.min;
    }
  }

  private takeRestart(): void {
    const r = this.restart!, { ball } = this;
    this.restart = null;
    if (r.kind === 'kickoff') {
      for (const p of this.players) { // everyone back in their own half
        const w = toWorld(p.team, Math.min(p.slot.x, 0.4), p.slot.y, PITCH_H);
        Object.assign(p, { x: w.x, y: w.y, vx: 0, vy: 0, fx: attackDir(p.team), fy: 0, state: 'normal', buffered: null });
      }
    }
    Object.assign(ball, createBall(r.x, r.y));
    const team = this.players.filter((p) => p.team === r.team);
    const taker = r.kind === 'kickoff' ? team.find((p) => p.role === 'FWD')!
      : r.kind === 'goal kick' ? team.find((p) => p.role === 'GK')!
      : team.filter((p) => p.role !== 'GK')
        .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
    const inField = r.kind === 'kickoff' ? { x: attackDir(r.team), y: 0 } : norm(PITCH_W / 2 - r.x, CENTRE_Y - r.y);
    Object.assign(taker, {
      x: r.x - inField.x * 0.6, y: r.y - inField.y * 0.6, vx: 0, vy: 0, fx: inField.x, fy: inField.y,
      state: 'normal', touchCd: 0, aiT: 0.5,
    });
    this.awaitKick = { team: r.team, x: r.x, y: r.y, min: r.kind === 'kickoff' ? 9.15 : 6 };
    this.keepDistance(this.awaitKick);
    this.lastTouch = taker;
    if (r.team === 0) this.controlled = taker.role === 'GK' ? this.controlled : taker;
  }
}
