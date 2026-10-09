import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { BallState, CaromState, PaddleState, StateView } from "./game";
import { readInput } from "./menus";
import { park } from "./state";
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
function move(p: PaddleState, vy: number, dt: number): PaddleState {
  const raw = p.cy + vy * dt,
    cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : vy };
}
function paddles(
  s: StateView,
  api: UpdateApi,
  dt: number,
): CaromState["paddles"] {
  const held = (a: C.ActionName) => api.input.value(a) > 0;
  const solo = s.mode === "solo";
  const leftVy =
    (Number(held("p1-down") || (solo && held("p2-down"))) -
      Number(held("p1-up") || (solo && held("p2-up")))) *
    C.PADDLE_SPEED;
  let rightVy =
    (Number(held("p2-down")) - Number(held("p2-up"))) * C.PADDLE_SPEED;
  if (solo) {
    const defend =
      s.ai.tracking &&
      s.screen === "playing" &&
      s.ball !== null &&
      s.ball.vx > 0;
    const target =
      defend && s.ball ? s.ball.y - s.ball.vy * C.AI_REACT : C.AI_HOME_Y;
    const diff = target - s.paddles.right.cy;
    rightVy =
      s.ai.movement &&
      Math.abs(diff) > (defend ? C.AI_DEADZONE : C.AI_HOME_DEADZONE)
        ? Math.sign(diff) *
          Math.min(C.AI_SPEED, dt > 0 ? Math.abs(diff) / dt : C.AI_SPEED)
        : 0;
  }
  return {
    left: move(
      s.paddles.left,
      s.paddles.left.driven ? s.paddles.left.drivenVy : leftVy,
      dt,
    ),
    right: move(
      s.paddles.right,
      s.paddles.right.driven ? s.paddles.right.drivenVy : rightVy,
      dt,
    ),
  };
}
type MovingBall = { -readonly [K in keyof BallState]: BallState[K] };
/** Expanded AABB resolution, with the specified stable face tie order. */
function rectangle(b: MovingBall, r: C.Rect): number {
  if (!(
    b.x > r.x0 - C.BALL_R &&
    b.x < r.x1 + C.BALL_R &&
    b.y > r.y0 - C.BALL_R &&
    b.y < r.y1 + C.BALL_R
  ))
    return -1;
  const depths = [
    b.x - r.x0 + C.BALL_R,
    r.x1 + C.BALL_R - b.x,
    b.y - r.y0 + C.BALL_R,
    r.y1 + C.BALL_R - b.y,
  ];
  const face = depths.indexOf(Math.min(...depths));
  if (face === 0) {
    b.x = r.x0 - C.BALL_R;
    if (b.vx > 0) b.vx = -b.vx;
  }
  if (face === 1) {
    b.x = r.x1 + C.BALL_R;
    if (b.vx < 0) b.vx = -b.vx;
  }
  if (face === 2) {
    b.y = r.y0 - C.BALL_R;
    if (b.vy > 0) b.vy = -b.vy;
  }
  if (face === 3) {
    b.y = r.y1 + C.BALL_R;
    if (b.vy < 0) b.vy = -b.vy;
  }
  return face;
}
export function fly(
  s: StateView,
  ball: BallState,
  dt: number,
  cues: Set<C.CueName>,
): BallState {
  const b: MovingBall = { ...ball };
  const n = Math.max(
      1,
      Math.ceil((Math.hypot(b.vx, b.vy) * dt) / C.MAX_SUBSTEP),
    ),
    h = dt / n;
  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const a = (b.spin / speed) * h,
        c = Math.cos(a),
        sn = Math.sin(a),
        vx = b.vx;
      b.vx = vx * c - b.vy * sn;
      b.vy = vx * sn + b.vy * c;
    }
    b.spin *= Math.pow(0.5, h / C.SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y - C.BALL_R < 0 && b.vy < 0) {
      b.y = C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    } else if (b.y + C.BALL_R > C.FIELD_H && b.vy > 0) {
      b.y = C.FIELD_H - C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
    for (const side of ["left", "right"] as const) {
      const p = s.paddles[side];
      const left = side === "left";
      const incomingVy = b.vy;
      const face = rectangle(b, {
        x0: left ? C.P1_X0 : C.P2_X0,
        x1: left ? C.P1_X1 : C.P2_X1,
        y0: p.cy - C.PADDLE_HALF,
        y1: p.cy + C.PADDLE_HALF,
      });
      if (face === 0 || face === 1) {
        const theta =
          clamp((b.y - p.cy) / C.PADDLE_HALF, -1, 1) * C.MAX_BOUNCE_ANGLE;
        const v = Math.min(Math.hypot(b.vx, b.vy) * C.SPEED_MULT, C.SPEED_CAP);
        b.vx = (left ? 1 : -1) * v * Math.cos(theta);
        b.vy = v * Math.sin(theta);
        b.spin = clamp(
          b.spin + p.vy * C.SPIN_FROM_PADDLE,
          -C.SPIN_CLAMP,
          C.SPIN_CLAMP,
        );
        b.x = left ? C.P1_X1 + C.BALL_R : C.P2_X0 - C.BALL_R;
        cues.add(C.CUES.paddleHit);
      } else if (face >= 2 && b.vy !== incomingVy) cues.add(C.CUES.wallBounce);
    }
    for (const o of s.obstacles) {
      const vx = b.vx,
        vy = b.vy;
      rectangle(b, C.OBSTACLES[o.index]);
      if (b.vx !== vx || b.vy !== vy) cues.add(C.CUES.obstacleBounce);
    }
  }
  return b;
}
export function update(
  state: StateView,
  api: UpdateApi,
  dt: number,
): CaromState {
  let s = readInput(state, api);
  s = { ...s, simTime: state.simTime + dt };
  if (s.screen !== "countdown" && s.screen !== "playing") return s;
  s = { ...s, paddles: paddles(s, api, dt) };
  if (!s.ball) return s;
  let b = s.ball;
  const cues = new Set<C.CueName>();
  if (s.screen === "countdown") {
    const timer = b.holdTimer - dt;
    b = { ...b, holdTimer: Math.max(0, timer) };
    if (timer <= 0) {
      b = {
        ...b,
        held: false,
        trail: [],
        vx:
          (s.receiver === "left" ? -1 : 1) *
          C.SERVE_SPEED *
          Math.cos(C.SERVE_ANGLE),
        vy: b.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
      };
      s = { ...s, screen: "playing" };
    }
  } else if (!b.held) b = fly(s, b, dt, cues);
  b = {
    ...b,
    trail: [
      ...b.trail.filter((p) => s.simTime - p.t <= C.TRAIL_TIME),
      { x: b.x, y: b.y, t: s.simTime },
    ],
  };
  s = { ...s, ball: b };
  if (
    s.screen === "playing" &&
    (b.x - C.BALL_R > C.FIELD_W || b.x + C.BALL_R < 0)
  ) {
    const left = b.x > C.FIELD_W,
      score = { p1: s.score.p1 + Number(left), p2: s.score.p2 + Number(!left) };
    const winner =
      score.p1 >= C.WIN_SCORE && score.p1 - score.p2 >= C.WIN_LEAD
        ? "left"
        : score.p2 >= C.WIN_SCORE && score.p2 - score.p1 >= C.WIN_LEAD
          ? "right"
          : null;
    s = {
      ...s,
      score,
      winner,
      ...(winner
        ? { screen: "matchover" as const, menuIndex: 0 }
        : {
            screen: "countdown" as const,
            receiver: left ? ("right" as const) : ("left" as const),
            ball: park(),
          }),
    };
    cues.add(C.CUES.score);
  }
  for (const cue of cues) api.audio.play(cue);
  return s;
}
