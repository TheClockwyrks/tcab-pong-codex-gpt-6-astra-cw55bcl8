import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { CaromState, MenuRect, Mode, StateView } from "./game";
import { initialState, park } from "./state";
export function items(s: StateView): readonly string[] {
  switch (s.screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "matchover":
      return C.MATCHOVER_ITEMS;
    case "howto":
      return ["BACK TO MENU"];
    default:
      return [];
  }
}
export function menuItemRect(s: StateView, index: number): MenuRect | null {
  if (index < 0 || index >= items(s).length || !Number.isInteger(index))
    return null;
  if (s.screen === "title")
    return { x: 104, y: 352 + index * 72, w: 390, h: 58 };
  return {
    x: 440,
    y: (s.screen === "howto" ? 578 : 360) + index * 68,
    w: 400,
    h: 54,
  };
}
function title(s: StateView): CaromState {
  return {
    ...initialState(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
function start(s: StateView, mode: Mode): CaromState {
  return {
    ...s,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: park(),
    menuPresses: {},
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
  };
}
function confirm(s: StateView): CaromState {
  switch (s.screen) {
    case "title": {
      const next = { ...s, titleIndex: s.menuIndex, menuPresses: {} };
      return s.menuIndex === 2
        ? { ...next, screen: "howto", menuIndex: 0 }
        : start(next, s.menuIndex === 0 ? "solo" : "versus");
    }
    case "howto":
      return title(s);
    case "paused":
      return s.menuIndex === 0
        ? { ...s, screen: s.resumeScreen, menuPresses: {} }
        : s.menuIndex === 1
          ? start(s, s.mode)
          : title(s);
    case "matchover":
      return s.menuIndex === 0 ? start(s, s.mode) : title(s);
    default:
      return s;
  }
}
export function readInput(s: StateView, api: UpdateApi): CaromState {
  const edge = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  ) as Record<C.ActionName, boolean>;
  const samples = api.input.pointerSamples();
  api.input.pointer();
  api.input.pointerContacts();
  let next: CaromState = { ...s, muted: edge.mute ? !s.muted : s.muted };
  api.audio.setMuted(next.muted);
  next = { ...next, muted: api.audio.muted() };
  if (s.screen === "playing" || s.screen === "countdown")
    return edge.pause
      ? {
          ...next,
          resumeScreen: s.screen,
          screen: "paused",
          menuIndex: 0,
          menuPresses: {},
        }
      : next;
  if (s.screen === "paused" && (edge.pause || edge.back))
    return { ...next, screen: s.resumeScreen, menuPresses: {} };
  if ((s.screen === "howto" || s.screen === "matchover") && edge.back)
    return title(next);
  const count = items(s).length;
  const up = edge["p1-up"] || edge["p2-up"],
    down = edge["p1-down"] || edge["p2-down"];
  if (up) next = { ...next, menuIndex: (next.menuIndex + count - 1) % count };
  else if (down) next = { ...next, menuIndex: (next.menuIndex + 1) % count };
  else if (edge.confirm) return confirm(next);
  const presses = { ...next.menuPresses };
  let activate = false;
  for (const sample of samples) {
    const index = items(s).findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return (
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (index >= 0) next = { ...next, menuIndex: index };
    if (sample.type === "down" && sample.button === "primary")
      presses[sample.id] = index;
    if (sample.type === "up") {
      if (index >= 0 && presses[sample.id] === index) activate = true;
      delete presses[sample.id];
    }
  }
  next = { ...next, menuPresses: presses };
  return activate ? confirm(next) : next;
}
