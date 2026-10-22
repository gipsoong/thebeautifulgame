import { CENTRE_Y, PITCH_W } from '../config';
import type { Ball } from './ball';
import type { Player } from './player';
import { type TeamId, attackDir, ownGoalX } from './team';

/** Inside the penalty area that `team` defends. */
export function inBox(team: TeamId, x: number, y: number): boolean {
  return Math.abs(x - ownGoalX(team)) < 16.5 && Math.abs(y - CENTRE_Y) < 20.16;
}

/**
 * Teammates of the passer in an offside position when the ball is played: in the opponents' half,
 * ahead of the ball and ahead of the second-last opponent.
 */
export function offsidePlayers(passer: Player, players: Player[], ball: Ball): Set<Player> {
  const dir = attackDir(passer.team);
  const opp = players.filter((p) => p.team !== passer.team).map((p) => p.x * dir).sort((a, b) => b - a);
  const line = Math.max(opp[1] ?? -Infinity, ball.x * dir, (PITCH_W / 2) * dir);
  return new Set(players.filter((p) => p.team === passer.team && p !== passer && p.x * dir > line + 0.2));
}
