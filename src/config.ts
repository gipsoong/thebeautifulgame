// All units are metres and seconds. World axes: x along the pitch, y across it (0 = far touchline), z up.

export const PITCH_W = 105;
export const PITCH_H = 68;
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const GOAL_D = 2.0;
export const CENTRE_Y = PITCH_H / 2;

export const DT = 1 / 120; // fixed simulation step

// Ball
export const G = 9.81;
export const BALL_R = 0.11;
export const AIR_DRAG = 0.012; // quadratic drag coefficient per metre
export const ROLL_DECEL = 1.6; // rolling resistance on grass (m/s^2)
export const ROLL_DRAG = 0.08; // speed-proportional rolling loss (1/s)
export const BOUNCE = 0.55;
export const BOUNCE_FRICTION = 0.8;
export const POST_R = 0.06;

// Players
export const JOG = 6.2;
export const SPRINT = 8.6;
export const DRIBBLE_FACTOR = 0.9;
export const ACCEL = 16; // m/s^2
export const DECEL = 22; // m/s^2, braking is quicker than accelerating
export const REACH = 0.75; // dribble touch distance
export const KICK_REACH = 1.1;
export const KICK_BUFFER = 0.35; // s a released kick waits for the ball to come into reach
export const CHARGE_TIME = 0.9; // s to full power

// Contact
export const PLAYER_R = 0.4; // body radius for player-player collisions
export const TACKLE_REACH = 1.4;
export const TACKLE_COOLDOWN = 0.8;
export const SLIDE_TIME = 0.6;
export const SLIDE_SPEED = 8.5;
export const DOWN_TIME = 1.0;

// Goalkeepers
export const GK_SPEED = 6;
export const GK_HOLD_TIME = 1.0;
