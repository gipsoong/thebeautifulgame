import { CENTRE_Y, GOAL_H, GOAL_W, PITCH_H, PITCH_W } from '../config';
import type { Actions } from '../input/actions';
import { type Ball, createBall, stepBall } from './ball';
import { tryKick } from './kick';
import { type Keeper, createKeeper, stepKeeper } from './keeper';
import { type Player, createPlayer, stepPlayer, updateCharge } from './player';

export type MatchEvent =
  | { type: 'message'; text: string }
  | { type: 'kick'; power: number }
  | { type: 'goal' };

/** One player, one ball and a keeper. Grows into the full match in phase 2. */
export class Match {
  player: Player = createPlayer(45, CENTRE_Y);
  ball: Ball = createBall(47, CENTRE_Y);
  keeper: Keeper = createKeeper();
  goals = 0;
  private resetTimer = 0;

  constructor(private rng: () => number = Math.random) {}

  step(a: Actions, dt: number): MatchEvent[] {
    const ev: MatchEvent[] = [];
    const { player, ball } = this;
    updateCharge(player, a, dt);
    const power = tryKick(player, ball, dt, this.rng);
    if (power !== null) ev.push({ type: 'kick', power });
    stepPlayer(player, ball, a, dt);
    if (stepBall(ball, dt)) ev.push({ type: 'message', text: 'Off the post!' });
    if (stepKeeper(this.keeper, ball, dt, this.rng)) ev.push({ type: 'message', text: 'Saved!' });
    this.checkGoalAndOut(dt, ev);
    return ev;
  }

  private checkGoalAndOut(dt: number, ev: MatchEvent[]): void {
    const { ball, player } = this;
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        Object.assign(ball, createBall(player.x + 1.5 * player.fx, player.y + 1.5 * player.fy));
      }
      return;
    }
    const inMouth = Math.abs(ball.y - CENTRE_Y) < GOAL_W / 2 && ball.z < GOAL_H;
    if (ball.x > PITCH_W && inMouth) {
      this.goals++;
      ev.push({ type: 'goal' }, { type: 'message', text: 'GOAL!' });
      this.netCatch(PITCH_W);
    } else if (ball.x < 0 && inMouth) {
      ev.push({ type: 'message', text: 'Own goal…' });
      this.netCatch(0);
    } else if (ball.x < -1 || ball.x > PITCH_W + 1 || ball.y < -1 || ball.y > PITCH_H + 1) {
      ev.push({ type: 'message', text: ball.y < 0 || ball.y > PITCH_H ? 'Throw-in' : 'Goal kick' });
      this.resetTimer = 1.2;
    }
  }

  private netCatch(lineX: number): void {
    const b = this.ball;
    b.vx *= 0.15; b.vy *= 0.15; b.vz = 0; b.z = Math.min(b.z, 1);
    b.x = lineX + Math.sign(b.x - lineX) * 1.2;
    this.resetTimer = 1.6;
  }
}
