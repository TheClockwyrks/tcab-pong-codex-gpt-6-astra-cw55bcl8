import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { BACKGROUND, game } from "./game";
import type { CaromState, StateView } from "./game";
import * as C from "./constants";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
});
async function setup(step = 10, draw = true) {
  const events = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    game: draw ? game : { ...game, render: () => undefined },
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  cleanups.push(() => engine.destroy());
  const debug = engine.debug;
  const pose = (f: (s: StateView) => CaromState) => engine.apply(f);
  const key = (code: string, type = "keydown") =>
    events.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, "keyup");
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) =>
    events.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: id === 1,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  const flying = (x: number, y: number, vx: number, vy: number) => {
    pose((s) => debug.clearWorld(s));
    pose((s) => debug.spawnBall(s));
    pose((s) => debug.setScreen(s, "playing"));
    pose((s) => debug.setBallHeld(s, false));
    pose((s) => debug.setBallPosition(s, x, y));
    pose((s) => debug.setBallVelocity(s, vx, vy));
  };
  return { engine, debug, pose, key, tap, pointer, flying };
}
describe("engine-driven match", () => {
  it("initializes the contract and reads diagnostics without changing state", async () => {
    const { engine, debug } = await setup();
    const s = engine.state;
    expect(s.screen).toBe("title");
    expect(s.obstacles).toHaveLength(2);
    expect(s.ball?.held).toBe(true);
    expect(debug.snapshot(s).ball?.speed).toBe(0);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    expect(debug.reconcile(s)).toEqual(s);
    expect(engine.state).toBe(s);
    await engine.advance(2);
    expect(engine.state.simTime).toBeCloseTo(0.02);
    expect(engine.state.ball).toEqual(s.ball);
  });
  it("serves on expiry without advancing the ball on the release frame", async () => {
    const { engine, debug, pose } = await setup(10);
    pose((s) => debug.setScreen(s, "countdown"));
    pose((s) => debug.setBallHoldTimer(s, 0.01));
    pose((s) => debug.setBallServeSign(s, -1));
    await engine.advance(1);
    const b = engine.state.ball!;
    expect(engine.state.screen).toBe("playing");
    expect(b.x).toBe(C.FIELD_CX);
    expect(b.held).toBe(false);
    expect(b.vy).toBeLessThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(C.SERVE_SPEED);
    await engine.advance(1);
    expect(engine.state.ball!.x).toBeLessThan(b.x);
  });
  it("moves both solo key pairs, clamps actual velocity, and keeps the driver independent", async () => {
    const { engine, debug, pose, key } = await setup();
    pose((s) => debug.setScreen(s, "countdown"));
    key("ArrowDown");
    await engine.advance(1);
    expect(engine.state.paddles.left.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.01,
    );
    pose((s) => debug.setPaddleCy(s, "left", C.PADDLE_MAX_CY));
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    pose((s) => debug.setPaddleVy(s, "left", -100));
    expect(engine.state.paddles.left.vy).toBe(0);
    pose((s) => debug.setPaddleDriven(s, "left", true));
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(-100);
    expect(engine.state.paddles.left.drivenVy).toBe(-100);
  });
  it("uses separate controls in versus and preserves driven flags on restart", async () => {
    const { engine, debug, pose, tap, key } = await setup();
    await tap("ArrowDown");
    await tap("Enter");
    expect(engine.state.mode).toBe("versus");
    key("KeyW");
    key("ArrowDown");
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(-C.PADDLE_SPEED);
    expect(engine.state.paddles.right.vy).toBe(C.PADDLE_SPEED);
    pose((s) => debug.setPaddleDriven(s, "right", true));
    await tap("Escape");
    await tap("KeyS");
    await tap("Enter");
    expect(engine.state.paddles.right.driven).toBe(true);
    expect(engine.state.score.p1).toBe(0);
  });
  it("freezes a pause and resumes only once for Escape's two edges", async () => {
    const { engine, tap } = await setup();
    await tap("Enter");
    await tap("Escape");
    const s = engine.state;
    expect(s.screen).toBe("paused");
    await engine.advance(4);
    expect(engine.state.ball).toEqual(s.ball);
    expect(engine.state.paddles).toEqual(s.paddles);
    expect(engine.state.simTime).toBeGreaterThan(s.simTime);
    await tap("Escape");
    expect(engine.state.screen).toBe("countdown");
  });
  it("turns speed-preserving spin and decays it by half", async () => {
    const { engine, debug, pose, flying } = await setup();
    flying(600, 350, 100, 0);
    pose((s) => debug.setBallSpin(s, 100));
    await engine.advance(80);
    expect(engine.state.ball!.spin).toBeCloseTo(50);
    expect(
      Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
    ).toBeCloseTo(100);
    expect(engine.state.ball!.y).toBeGreaterThan(350);
    expect(
      engine.state.ball!.trail.every(
        (p) => engine.state.simTime - p.t <= C.TRAIL_TIME,
      ),
    ).toBe(true);
  });
  it.each([2, 8, 16])(
    "reflects at the wall without tunneling at %i ms",
    async (step) => {
      const { engine, flying } = await setup(step);
      flying(300, 14, 0, -C.SPEED_CAP);
      await engine.advance(Math.ceil(32 / step));
      expect(engine.state.ball!.vy).toBe(C.SPEED_CAP);
      expect(engine.state.ball!.y).toBeGreaterThanOrEqual(C.BALL_R);
    },
  );
  it.each(["left", "right"] as const)(
    "adds paddle motion to spin at the %s face",
    async (side) => {
      const { engine, debug, pose, flying } = await setup();
      const left = side === "left";
      flying(left ? 80 : 1200, C.FIELD_CY, left ? -520 : 520, 0);
      pose((s) => debug.setPaddleDriven(s, side, true));
      pose((s) => debug.setPaddleVy(s, side, 100));
      const before = engine.state;
      await engine.advance(1);
      const b = engine.state.ball!;
      expect(Math.sign(b.vx)).toBe(left ? 1 : -1);
      expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(520 * C.SPEED_MULT);
      expect(b.spin).toBeGreaterThan(80);
      expect(before.ball!.spin).toBe(0);
    },
  );
  it("resolves a paddle end cap without speed gain", async () => {
    const { engine, flying } = await setup();
    flying(56, C.FIELD_CY - C.PADDLE_HALF - 12, 0, 300);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(-300);
    expect(engine.state.ball!.spin).toBe(0);
  });
  it("reflects from an obstacle and plays its cue once per frame", async () => {
    const { engine, debug, pose, flying } = await setup();
    flying(465, 220, 520, 0);
    pose((s) => debug.spawnObstacle(s, 0));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBe(-520);
    expect(cues).toEqual([C.CUES.obstacleBounce]);
  });
  it("parks after a point and serves toward the receiver", async () => {
    const { engine, flying } = await setup();
    flying(C.FIELD_W + C.BALL_R + 1, 100, 520, 0);
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 1, p2: 0 });
    expect(engine.state.receiver).toBe("right");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.ball!.trail).toEqual([]);
    await engine.advance(101);
    expect(engine.state.ball!.vx).toBeGreaterThan(0);
  });
  it("requires a two point lead and leaves the final ball at the goal", async () => {
    const { engine, debug, pose, flying } = await setup();
    pose((s) => debug.setScore(s, 10, 10));
    flying(-20, 100, -520, 0);
    await engine.advance(1);
    expect(engine.state.screen).toBe("countdown");
    flying(-20, 100, -520, 0);
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 10, p2: 12 });
    expect(engine.state.winner).toBe("right");
    expect(engine.state.screen).toBe("matchover");
    expect(engine.state.ball!.x).toBeLessThan(0);
  });
  it("gates AI tracking and movement separately", async () => {
    const { engine, debug, pose, flying } = await setup();
    flying(850, 600, 100, 0);
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(C.AI_SPEED);
    pose((s) => debug.setAiMovement(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    pose((s) => debug.setAiMovement(s, true));
    pose((s) => debug.setAiTracking(s, false));
    pose((s) => debug.setPaddleCy(s, "right", 600));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(-C.AI_SPEED);
  });
  it("prioritizes menu up over down and movement over confirm", async () => {
    const { engine, key } = await setup();
    key("KeyW");
    key("ArrowDown");
    key("Enter");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(2);
    expect(engine.state.screen).toBe("title");
  });
  it("remembers title selection through how-to, restart, and quit", async () => {
    const { engine, tap } = await setup();
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.screen).toBe("howto");
    await tap("Enter");
    expect(engine.state.menuIndex).toBe(2);
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.mode).toBe("versus");
    await tap("KeyP");
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
  });
  it.each(["mouse", "touch"])(
    "requires both %s edges in one menu region across frames",
    async (device) => {
      const { engine, debug, pointer } = await setup();
      const a = debug.menuItemRect(engine.state, 0)!,
        b = debug.menuItemRect(engine.state, 1)!;
      pointer("pointerdown", a.x + 10, a.y + 10, 1, device);
      await engine.advance(1);
      pointer("pointerup", b.x + 10, b.y + 10, 1, device);
      await engine.advance(1);
      expect(engine.state.screen).toBe("title");
      pointer("pointerdown", b.x + 10, b.y + 10, 1, device);
      await engine.advance(1);
      pointer("pointerup", b.x + 10, b.y + 10, 1, device);
      await engine.advance(1);
      expect(engine.state.mode).toBe("versus");
      expect(engine.state.screen).toBe("countdown");
    },
  );
  it("supports same-frame click and gives keyboard confirmation precedence", async () => {
    const { engine, debug, pointer, key } = await setup();
    const b = debug.menuItemRect(engine.state, 1)!;
    pointer("pointerdown", b.x + 10, b.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.mode).toBe("solo");
  });
  it("mutes via state poses and the action, preserving mute on reset", async () => {
    const { engine, debug, pose, tap, flying } = await setup();
    pose((s) => debug.setMuted(s, true));
    const gains: number[] = [];
    engine.events.on("cue:played", (e) => gains.push(e.gain));
    flying(300, 12, 0, -520);
    await engine.advance(1);
    expect(gains).toEqual([0]);
    pose((s) => debug.reset(s));
    expect(engine.state.muted).toBe(true);
    await tap("KeyM");
    expect(engine.state.muted).toBe(false);
  });
  it("poses fields independently, rejects missing entities, and deep copies snapshots", async () => {
    const { engine, debug, pose } = await setup();
    pose((s) => debug.clearWorld(s));
    expect(() => debug.setBallSpin(engine.state, 4)).toThrow();
    expect(() => debug.spawnObstacle(engine.state, 2)).toThrow();
    await engine.advance(1);
    pose((s) => debug.spawnBall(s));
    pose((s) => debug.spawnObstacle(s, 1));
    pose((s) => debug.spawnObstacle(s, 0));
    pose((s) => debug.setTitleIndex(s, 2));
    pose((s) => debug.setResumeScreen(s, "countdown"));
    pose((s) => debug.setWinner(s, "left"));
    pose((s) => debug.setReceiver(s, "right"));
    pose((s) => debug.setMode(s, "versus"));
    pose((s) => debug.setMenuIndex(s, 1));
    pose((s) => debug.drawBallServeSign(s));
    const snap = debug.snapshot(engine.state);
    expect(snap.titleIndex).toBe(2);
    expect(snap.resumeScreen).toBe("countdown");
    expect(snap.winner).toBe("left");
    expect(snap.receiver).toBe("right");
    expect(snap.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(snap.ball).not.toBe(engine.state.ball);
    expect(debug.menuItemRect(engine.state, 9)).toBeNull();
    pose((s) => debug.setScreen(s, "playing"));
    expect(debug.menuItemRect(engine.state, 0)).toBeNull();
    pose((s) => debug.reset(s));
    expect(engine.state.simTime).toBe(0);
  });
  it("renders every screen through the engine recorder", async () => {
    const { engine, debug, pose } = await setup();
    engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      pose((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(6);
    expect(recording.ops.length).toBeGreaterThan(100);
  });
  it("agrees on contacts, speed, and direction at 2 and 16 ms", async () => {
    const outcomes = [];
    for (const step of [2, 16]) {
      const { engine, flying } = await setup(step, false);
      flying(200, C.FIELD_CY, -C.SERVE_SPEED, 0);
      const cues: string[] = [];
      engine.events.on("cue:played", (e) => cues.push(e.cue));
      await engine.advance(4000 / step);
      outcomes.push({
        ball: engine.state.ball!,
        cues,
        score: engine.state.score,
        time: engine.state.simTime,
      });
    }
    expect(outcomes[0].cues).toEqual(outcomes[1].cues);
    expect(outcomes[0].cues.length).toBeGreaterThanOrEqual(2);
    expect(outcomes[0].score).toEqual(outcomes[1].score);
    expect(outcomes[0].ball.vx).toBeCloseTo(outcomes[1].ball.vx);
    expect(outcomes[0].ball.vy).toBeCloseTo(outcomes[1].ball.vy);
    expect(outcomes[0].time).toBeCloseTo(outcomes[1].time);
  });
  it("caps paddle acceleration and resolves bottom-facing surfaces", async () => {
    const { engine, debug, pose, flying } = await setup();
    flying(80, C.FIELD_CY, -C.SPEED_CAP, 0);
    await engine.advance(1);
    expect(
      Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
    ).toBeCloseTo(C.SPEED_CAP);
    flying(300, C.FIELD_H - C.BALL_R - 1, 0, 400);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(-400);
    flying(490, 302, 0, -400);
    pose((s) => debug.spawnObstacle(s, 0));
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBe(400);
  });
  it("confirms a same-frame pointer click without a keyboard edge", async () => {
    const { engine, debug, pointer } = await setup();
    const r = debug.menuItemRect(engine.state, 2)!;
    pointer("pointerdown", r.x + 20, r.y + 20);
    pointer("pointerup", r.x + 20, r.y + 20);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    expect(engine.state.titleIndex).toBe(2);
  });
});
