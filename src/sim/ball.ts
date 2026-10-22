import {
  AIR_DRAG, BALL_R, BOUNCE, BOUNCE_FRICTION, CENTRE_Y, G, GOAL_H, GOAL_W, PITCH_W, POST_R, ROLL_DECEL, ROLL_DRAG,
} from '../config';

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  spin: number; // sideways swerve, decays in flight
}

export function createBall(x: number, y: number): Ball {
  return { x, y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
}

const POSTS: [number, number][] = [
  [0, CENTRE_Y - GOAL_W / 2], [0, CENTRE_Y + GOAL_W / 2],
  [PITCH_W, CENTRE_Y - GOAL_W / 2], [PITCH_W, CENTRE_Y + GOAL_W / 2],
];

/** Advances the ball one step. Returns true if it hit a post. */
export function stepBall(ball: Ball, dt: number): boolean {
  const sp = Math.hypot(ball.vx, ball.vy);
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= G * dt;
    const k = AIR_DRAG * Math.hypot(sp, ball.vz) * dt;
    ball.vx -= ball.vx * k; ball.vy -= ball.vy * k; ball.vz -= ball.vz * k;
    if (sp > 1) { // Magnus-style swerve perpendicular to travel
      const c = ball.spin * 0.08 * dt, vx0 = ball.vx;
      ball.vx += -ball.vy * c; ball.vy += vx0 * c;
    }
    ball.spin *= 1 - 0.4 * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= 0) {
      ball.z = 0;
      if (ball.vz < -1.2) {
        ball.vz = -ball.vz * BOUNCE; ball.vx *= BOUNCE_FRICTION; ball.vy *= BOUNCE_FRICTION; ball.z = 0.001;
      } else ball.vz = 0;
    }
  } else if (sp > 0) {
    const ns = Math.max(0, sp - (ROLL_DECEL + ROLL_DRAG * sp) * dt);
    ball.vx *= ns / sp; ball.vy *= ns / sp; ball.spin = 0;
  }
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  return collidePosts(ball);
}

function collidePosts(ball: Ball): boolean {
  if (ball.z > GOAL_H) return false;
  let hit = false;
  for (const [px, py] of POSTS) {
    const dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy), r = BALL_R + POST_R;
    if (d < r && d > 0) {
      const nx = dx / d, ny = dy / d, vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= 1.7 * vn * nx; ball.vy -= 1.7 * vn * ny; hit = true; }
      ball.x = px + nx * r; ball.y = py + ny * r;
    }
  }
  return hit;
}
