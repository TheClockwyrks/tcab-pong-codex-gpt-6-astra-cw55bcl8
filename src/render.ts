import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { StateView } from "./game";
import { items, menuItemRect } from "./menus";
const P = {
  mint: "#7fffd0",
  coral: "#ff897e",
  gold: "#e8c981",
  white: "#e8f4ef",
  muted: "#839d9e",
  line: "#244047",
  panel: "#10292f",
};
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  label: string,
  x: number,
  y: number,
  size = 16,
  color = P.white,
  align: CanvasTextAlign = "left",
  weight = 500,
): void {
  ctx.font = `${weight} ${size}px ${size <= 16 ? '"Courier New", monospace' : '"Arial", sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = P.line,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function bar(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  glow = 0,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(w / 2, 8));
  ctx.fill();
  ctx.restore();
}
function dot(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function court(ctx: Context, s: StateView): void {
  // Quiet survey grid and court markings give the flat field depth without clutter.
  for (let x = 24; x < C.FIELD_W; x += 32)
    for (let y = 24; y < C.FIELD_H; y += 32) dot(ctx, x, y, 0.7, "#183139");
  line(ctx, 24, 1, C.FIELD_W - 24, 1, "#476168", 2);
  line(ctx, 24, C.FIELD_H - 1, C.FIELD_W - 24, C.FIELD_H - 1, "#476168", 2);
  ctx.save();
  ctx.setLineDash([5, 13]);
  line(ctx, C.NET_X, 20, C.NET_X, C.FIELD_H - 20, "#2c454a");
  ctx.restore();
  ctx.strokeStyle = "#243e44";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(C.FIELD_CX, C.FIELD_CY, 62, 0, Math.PI * 2);
  ctx.stroke();
  for (const o of s.obstacles) {
    bar(
      ctx,
      o.cx - C.OBSTACLE_HW - 7,
      o.cy - C.OBSTACLE_HH - 7,
      C.OBSTACLE_W + 14,
      C.OBSTACLE_H + 14,
      "#233738",
    );
    bar(
      ctx,
      o.cx - C.OBSTACLE_HW,
      o.cy - C.OBSTACLE_HH,
      C.OBSTACLE_W,
      C.OBSTACLE_H,
      P.gold,
      14,
    );
    text(
      ctx,
      o.index === 0 ? "A" : "B",
      o.cx,
      o.cy + C.OBSTACLE_HH + 24,
      12,
      P.muted,
      "center",
    );
  }
  bar(
    ctx,
    C.P1_X0,
    s.paddles.left.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    P.mint,
    20,
  );
  bar(
    ctx,
    C.P2_X0,
    s.paddles.right.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    P.coral,
    20,
  );
  if (s.ball) {
    const b = s.ball;
    b.trail.forEach((p, i) => {
      ctx.globalAlpha = ((i + 1) / Math.max(1, b.trail.length)) * 0.34;
      dot(
        ctx,
        p.x,
        p.y,
        C.BALL_R * (0.25 + (0.65 * i) / Math.max(1, b.trail.length)),
        P.white,
      );
    });
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = P.mint;
    ctx.shadowBlur = 18;
    dot(ctx, b.x, b.y, C.BALL_R, P.white);
    ctx.restore();
  }
}
function menu(ctx: Context, s: StateView): void {
  items(s).forEach((label, i) => {
    const r = menuItemRect(s, i)!;
    const active = i === s.menuIndex;
    bar(ctx, r.x, r.y, r.w, r.h, active ? P.mint : "#132c32");
    text(
      ctx,
      `0${i + 1}`,
      r.x + 22,
      r.y + r.h / 2,
      13,
      active ? "#35695c" : P.muted,
    );
    text(
      ctx,
      label,
      r.x + 66,
      r.y + r.h / 2,
      18,
      active ? "#0a2925" : P.white,
      "left",
      700,
    );
    if (active)
      text(ctx, "↗", r.x + r.w - 30, r.y + r.h / 2, 26, "#0a2925", "center");
  });
}
function header(ctx: Context, s: StateView): void {
  text(ctx, C.TITLE_TEXT, 40, 35, 17, P.white, "left", 800);
  text(
    ctx,
    s.mode === "solo" ? "SOLO / HUMAN × MACHINE" : "VERSUS / LOCAL DUEL",
    C.FIELD_CX,
    33,
    12,
    P.muted,
    "center",
  );
  text(
    ctx,
    `${C.WIN_SCORE} POINTS · WIN BY ${C.WIN_LEAD}`,
    C.FIELD_W - 40,
    35,
    12,
    P.muted,
    "right",
  );
  text(ctx, "01 / YOU", C.FIELD_CX - 100, 66, 12, P.mint, "right");
  text(
    ctx,
    s.mode === "solo" ? "CPU / 02" : "PLAYER / 02",
    C.FIELD_CX + 100,
    66,
    12,
    P.coral,
  );
  text(
    ctx,
    String(s.score.p1).padStart(2, "0"),
    C.FIELD_CX - 100,
    111,
    58,
    P.white,
    "right",
    700,
  );
  text(
    ctx,
    String(s.score.p2).padStart(2, "0"),
    C.FIELD_CX + 100,
    111,
    58,
    P.white,
    "left",
    700,
  );
  text(ctx, "W / S", 40, C.FIELD_H - 30, 12, P.mint);
  text(ctx, "P  PAUSE", C.FIELD_CX - 16, C.FIELD_H - 30, 12, P.muted, "right");
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    C.FIELD_CX + 16,
    C.FIELD_H - 30,
    12,
    P.muted,
  );
  text(
    ctx,
    s.mode === "solo" ? "AUTOPILOT" : "↑ / ↓",
    C.FIELD_W - 40,
    C.FIELD_H - 30,
    12,
    P.coral,
    "right",
  );
}
function title(ctx: Context, s: StateView): void {
  for (let x = 24; x < C.FIELD_W; x += 32)
    for (let y = 24; y < C.FIELD_H; y += 32) dot(ctx, x, y, 0.7, "#132a30");
  const fade = ctx.createLinearGradient(0, 0, 850, 0);
  fade.addColorStop(0, "#091b20");
  fade.addColorStop(0.65, "#091b20");
  fade.addColorStop(1, "#091b2000");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  text(ctx, "C /", 104, 70, 24, P.mint, "left", 800);
  text(ctx, "A GAME OF ANGLES", 167, 70, 12, P.muted);
  text(ctx, "01 — THE PADDLE DUEL", 106, 160, 13, P.mint);
  text(ctx, C.TITLE_TEXT, 96, 240, 108, P.white, "left", 900);
  text(ctx, "Find your angle. Change the game.", 106, 312, 20, P.muted);
  menu(ctx, s);
  text(ctx, "W S / ↑ ↓  SELECT     ENTER  PLAY", 106, 608, 12, P.muted);
  line(ctx, 104, 648, 1176, 648);
  text(ctx, "SPIN. BANK. OUTPLAY.", 104, 678, 12, P.mint);
  text(
    ctx,
    `1–2 PLAYERS   /   FIRST TO ${C.WIN_SCORE}`,
    1176,
    678,
    12,
    P.muted,
    "right",
  );
  // A diagram of a bank shot, drawn as a designed illustration of the mechanic.
  ctx.save();
  ctx.translate(705, 150);
  text(ctx, "THE ANGLE IS YOURS", 225, 18, 12, P.muted, "center");
  line(ctx, 0, 58, 420, 58);
  line(ctx, 0, 416, 420, 416);
  ctx.setLineDash([4, 9]);
  line(ctx, 210, 66, 210, 404);
  ctx.setLineDash([]);
  bar(ctx, 16, 222, 12, 80, P.mint, 18);
  bar(ctx, 392, 116, 12, 80, P.coral, 18);
  bar(ctx, 144, 91, 16, 108, P.gold, 14);
  bar(ctx, 274, 281, 16, 108, P.gold, 14);
  ctx.strokeStyle = P.mint;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 255);
  ctx.bezierCurveTo(94, 251, 114, 203, 133, 146);
  ctx.quadraticCurveTo(96, 83, 75, 69);
  ctx.quadraticCurveTo(210, 100, 345, 214);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = i / 10;
    dot(ctx, 302 + i * 6, 183 + i * 4.6, 3 + i * 0.5, P.white);
  }
  ctx.globalAlpha = 1;
  dot(ctx, 350, 220, 10, P.white);
  text(ctx, "MOTION BECOMES SPIN", 210, 454, 12, P.mint, "center");
  ctx.restore();
}
export function render(s: StateView, api: RenderApi): void {
  const ctx = api.ctx;
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  court(ctx, s);
  header(ctx, s);
  if (s.screen === "countdown") {
    bar(ctx, 520, 420, 240, 58, P.panel);
    text(
      ctx,
      `SERVING ${s.receiver === "left" ? "←" : "→"}  ${Math.max(0, s.ball?.holdTimer ?? 0).toFixed(1)}`,
      C.FIELD_CX,
      449,
      16,
      P.mint,
      "center",
    );
  }
  if (s.screen === "playing" || s.screen === "countdown") return;
  ctx.fillStyle = "#061519d9";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  if (s.screen === "howto") {
    text(ctx, "THE FIELD GUIDE", C.FIELD_CX, 108, 13, P.mint, "center");
    text(
      ctx,
      "Make every angle count.",
      C.FIELD_CX,
      169,
      44,
      P.white,
      "center",
      700,
    );
    const columns = [
      {
        x: 170,
        n: "01",
        heading: "TAKE CONTROL",
        lines: [
          "SOLO   W / S or ↑ / ↓",
          "VERSUS   W / S vs ↑ / ↓",
          "P / ESC   Pause or resume",
          "M   Toggle sound",
        ],
      },
      {
        x: 505,
        n: "02",
        heading: "PUT A SPIN ON IT",
        lines: [
          "Move your paddle as you hit.",
          "Up adds counterclockwise spin;",
          "down adds clockwise spin.",
          "Edge hits open wider angles.",
        ],
      },
      {
        x: 850,
        n: "03",
        heading: "PLAY THE BANK",
        lines: [
          "Gold obstacles redirect shots.",
          "Use walls to find a way past.",
          `First to ${C.WIN_SCORE}, ahead by ${C.WIN_LEAD}.`,
          "Keep going if you’re tied.",
        ],
      },
    ];
    for (const c of columns) {
      text(ctx, c.n, c.x, 262, 36, P.mint, "left", 700);
      line(ctx, c.x, 303, c.x + 265, 303);
      text(ctx, c.heading, c.x, 340, 17, P.white, "left", 700);
      c.lines.forEach((l, i) => text(ctx, l, c.x, 390 + i * 30, 15, P.muted));
    }
    menu(ctx, s);
    return;
  }
  text(
    ctx,
    s.screen === "paused" ? "TAKE A BREATHER" : "MATCH COMPLETE",
    C.FIELD_CX,
    180,
    13,
    P.mint,
    "center",
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Paused."
      : s.winner === "left"
        ? "Player one wins."
        : s.mode === "solo"
          ? "Machine wins."
          : "Player two wins.",
    C.FIELD_CX,
    245,
    56,
    P.white,
    "center",
    700,
  );
  text(
    ctx,
    s.screen === "paused"
      ? "Your next angle can wait."
      : `${s.score.p1}  —  ${s.score.p2}   /   WELL PLAYED`,
    C.FIELD_CX,
    308,
    17,
    P.muted,
    "center",
  );
  menu(ctx, s);
  text(
    ctx,
    "W S / ↑ ↓  SELECT    ENTER  CONFIRM",
    C.FIELD_CX,
    607,
    12,
    P.muted,
    "center",
  );
}
