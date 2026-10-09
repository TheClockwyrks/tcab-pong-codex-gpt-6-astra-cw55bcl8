# Carom

A fast, top-down paddle duel about spin and bank shots. Move your paddle as it strikes to curve the ball, work around two gold obstacles, and reach 11 points with a two-point lead. Play against the AI or share a keyboard with a friend.

Everything is drawn on canvas and all sounds are synthesized. The static game needs no server, accounts, external assets, or runtime network requests.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Production

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Deploy that directory at the root of a static host.

## Controls

| Action | Controls |
| --- | --- |
| Solo paddle | W / S or Up / Down |
| Versus left paddle | W / S |
| Versus right paddle | Up / Down |
| Menu navigation | W / S or Up / Down |
| Confirm | Enter / Space, or click / tap an item |
| Pause / resume | P / Escape |
| Back | Escape |
| Mute | M |
| Engine diagnostics | Backtick |

On touchscreens, the engine provides two vertical paddle sliders and menu buttons. Move during contact to add spin; hit near a paddle's edge for a wider angle. Top and bottom walls and gold obstacles reflect shots. Every paddle hit makes the ball faster.

## Development checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests run the actual Simple 2D engine with a private canvas, input target, and counted clock. `src/simulation.ts` contains the render-free physics; `src/menus.ts` handles input and transitions; `src/render.ts` draws the screens; `src/state.ts` builds state and the debug poses. The engine owns timing, fitting, touch controls, audio, and the debug overlay. The debug surface is returned by `initialize` and is available only through an engine handle.

Player-facing screenshots and a replay of the game's own drawing are in `showcase/`.
