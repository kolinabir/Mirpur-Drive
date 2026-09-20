# Debug hook for automated browser review

Added in `src/main.js` right after the world is built (after `minimap` is
created, before the "Ready" progress step) — it exists as soon as
`window.__mirpur` is defined, independent of whether "Enter the street" has
been clicked.

```js
window.__mirpur = { player, scene: scene3, renderer, camera, metro, collision, capture() {...} };
```

- `player` — the live `Player` instance (`src/player.js`). Set
  `player.yaw` / `player.pitch` (radians, pitch negative = look down),
  `player.position.set(x, y, z)`, `player.feetY` (walking height — see
  below), `player.flying = true/false`.
- `scene` — `scene3`, the root `THREE.Scene`.
- `renderer`, `camera` — the live `WebGLRenderer` / `PerspectiveCamera`.
- `metro` — result of `buildMetro()`: `metro.stations`, `metro.group`, etc.
- `collision` — the collision-grid object from `buildCollisionGrid()`,
  extended with `.addSegments(segs)` (see src/walkable.js).
- `walkable` — the registry from `createWalkableRegistry()`
  (`src/walkable.js`): `.slab()`, `.ramp()`, `.supportHeightAt(x,z,y)`,
  `.movingDeltaAt(x,z,dt)`, `.addSegments(collision, segs)`, `.surfaces`.
  Added to the hook in the E3b pass (was missing — E3 wired the registry
  itself but never exposed it here).
- `interior` — the station-interior system from `createInteriorSystem()`
  (`src/interior.js`): `.update(dt, player)` (also returns the current HUD
  interaction line), `.interact(player)`, `.state`
  (`hasTicket`/`hint`/`gates`/`liftTween`), `.interactables`. Also added in
  the E3b pass.
- `capture()` — renders one frame and returns
  `renderer.domElement.toDataURL('image/jpeg', 0.7)`. Wrapped in try/catch
  so a render-time exception elsewhere in the scene graph doesn't throw out
  of `capture()` — it still returns whatever was last composited.

## Looking around without pointer lock

Mouse-look needs `requestPointerLock`, which an automated browser cannot
obtain. Two options:

1. **Preferred**: set `window.__mirpur.player.yaw` / `.pitch` directly.
2. **Keyboard look** (`src/player.js`): `[` / `]` pitch down/up, `,` / `.`
   yaw, ~1.1 rad/s while held. These are real held-key controls — a
   single scripted tap-and-release from most browser-automation "press a
   key" tools fires keydown+keyup back-to-back inside one task, faster than
   a frame, so nothing visibly happens. To drive them from a script, hold
   the key open across an awaited delay, e.g.:
   ```js
   window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight', key: ']' }));
   await new Promise(r => setTimeout(r, 400));
   window.dispatchEvent(new KeyboardEvent('keyup', { code: 'BracketRight', key: ']' }));
   ```
   Verified this way: 400 ms held gives `pitch ≈ 0.45` rad (1.1 rad/s × 0.4s).
   `normalizeKeyCode` also accepts the bare character (`k.has(']')`) so this
   works even if a harness's synthetic event only populates `e.key`.

## Pitch reset on quick-travel

`Digit4` (aerial view) sets `player.pitch = -0.62` and it used to leak into
every other preset. `Digit1` / `Digit2` / `Digit3` now explicitly set
`player.pitch = 0` right after `teleport()` (`src/main.js`). Verified live:
pressed `4` (pitch -0.62) then `1` → `player.pitch` reads `0`.

## Player vertical state (walkable interiors)

`player.feetY` is now the authoritative walking height (ground/stairs/
platform surface); `player.position.y` is derived (`feetY + EYE_HEIGHT +
bob`) and only meaningful directly in fly mode. `player.vy` is the current
fall speed. See `docs/WALKABLE-INTERIOR-DESIGN.md` and
`docs/INTERIOR-PASS.md`.

## A render-time exception is not fatal to the frame loop

`main.js`'s `frame()` now wraps `renderer.render(scene3, camera)` in
try/catch, logging once via `console.error` and continuing. This was added
because a concurrently-edited file crashed every `render()` call on this
pass's dev server for a while (a `THREE.MeshStandardMaterial` uniform
mismatch, unrelated to player/interior code — see docs/INTERIOR-PASS.md
"needs from E2/E1"); without the guard, the whole rAF loop died on frame 1
and nothing — not even this hook's `capture()` — could produce a screenshot.

## Verified

Fresh `navigate` to `http://localhost:5183`, waited for `loading-text` to
read "Ready", clicked `#begin`. Confirmed in the SAME tab (single `main()`
instance — see caveat below):
- `window.__mirpur.player` exists, `feetY === 0` at the default start spot.
- `capture` is a function.
- `collision` and `metro` are present.
- `Digit4` then `Digit1` → `player.pitch === 0`.
- Holding `BracketRight`/`]` via dispatched keydown/keyup for 400 ms moved
  `player.pitch` from 0 to ~0.45.

**Caveat for whoever scripts review next**: don't `import()` `src/main.js`
a second time in the same page to "retry" — each import re-runs `main()`
and creates an entirely new `Player`/renderer/rAF loop that keeps running
alongside the original, and `window.__mirpur` gets silently reassigned to
whichever one imported last, which may not be the instance actually
driving the visible canvas. If something looks wrong, do a real
`navigate()` (or close+reopen the tab) instead of a dynamic re-import.

## `stationlife` (P11-J, 2026-09-07)

`window.__mirpur.stationlife` — result of `createStationLife()`
(`src/stationlife.js`): `.update(dt, player)` (returns/also drives the
current "E: ..." HUD line), `.interact(player)`, `.state`.

`.state` shape:
- `riding` (bool), `rideTrainIndex`, `boardStation`, `nextStopName`,
  `pendingAlight` (`{ stationName } | null`), `hint` (current HUD string).
- `trains[]` — index-aligned with `metro.trains` once the concurrent
  metro.js pass exports it: `{ berthed, station, side, phase, doorAmt01,
  speed }` per train. Empty (`[]`) and a one-time `console.warn` if
  `metro.trains` doesn't exist yet — this is expected, not a bug, until
  that lands.

While `stationlife.state.riding` is true, `player.update()` is not called
(main.js) — `stationlife.update()` drives `player.position`/`feetY`/camera
by hand every frame instead. `player.yaw`/`.pitch` (this hook's usual
look-without-pointer-lock knobs, see above) keep working exactly as
before even while riding, since mouse-look/keyboard-look write those two
fields directly and are never gated on `player.update()` running.
