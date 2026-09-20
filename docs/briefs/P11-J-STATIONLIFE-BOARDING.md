# P11-J — Berth detection, door timing, and riding the train

**Owner: a NEW file `src/stationlife.js`, plus `src/main.js`.**
Do NOT touch src/metro.js or src/interior.js — a concurrent executor owns
both this pass and is building the setters you will call. Do not touch
src/signs.js, src/traffic.js, src/textures.js. Do NOT use the browser
preview tools (shared, throttled); the advisor verifies. Do not commit.

## Item 0 — a one-line look fix in main.js, do this first
`scene3.environmentIntensity` is currently 0.35 by day. The advisor
measured live that this washes the station canopy from DMTCL dark green to
a pale mint sheen — it is the brightest thing in an aerial view when it
should be one of the darkest. **0.12 is correct**: verified live, the
canopy reads as dark green corrugated roof and nothing in the interior
goes back to black. Change the day value 0.35 -> 0.12 and leave the night
value alone. Add a comment recording that this was measured, not guessed.

## Item 1 — `src/stationlife.js`
```
createStationLife(scene3, metro, walkable, collision, player)
  -> { update(dt, player), interact(player), state }
```
Model it on `createInteriorSystem` in src/interior.js: an `interactables`
list of `{ position, label, range, action }`, an `update` that returns the
HUD line, and an `interact` that fires the nearest one.

### Berth detection
`buildMetro()` animates 2 trains in its `update(elapsed)`; they travel at
`SPEED = 16` and dwell at every stop. The concurrent metro.js executor is
exporting `trains` (or a read-only view of each train's world position,
heading and direction) — use it. A train is *berthed* at a station when it
is within ~2 m of the station centre along the track and effectively
stopped. Work out which platform side it is on from its direction.

### Door timing
Drive both setters the metro.js/interior.js executor is exporting:
```
metro.setPlatformDoors(stationName, side, amount01)
interior.setPsdOpen(stationName, side, amount01)
```
Open over ~1.2 s once berthed, hold, and start closing ~2.5 s before
departure. **Doors must be fully shut before the train moves** — if the
dwell is too short to fit open + hold + close, say so in your report
rather than letting a train leave with its doors open.

These two functions are a contract with a concurrent executor. If either
is missing at runtime (their work lands after yours), **degrade
gracefully** — feature-detect and no-op with a single console.warn, do not
throw. The game must still start.

### Boarding, riding, alighting
- While doors are open and the player is on that platform within ~3 m of a
  bay: offer `E: board train`.
- On board: park the player inside the car and keep them following the
  train's position each frame; show a HUD line naming the next stop.
- When the train berths at the next station and the doors open: offer
  `E: get off`. On alight, place the player on that platform beside the
  open bay at `DECK_Y`, restore normal control, and set `player.feetY` so
  the walkable registry picks up the platform — the failure mode to avoid
  is the player falling to street level on alighting.
- Auto-alight at the terminus so the player can never be stuck aboard.
- While aboard, suppress the walkable/gravity path (the player is not
  standing on a registered surface) and make sure `resolveCollision` does
  not fight the ride.

## Item 2 — wiring in `src/main.js`
Create the system after `interior` is created, call `update(dt, player)`
in the frame loop, route the `E` key to it, and merge its HUD line with
the one `interior.update()` already returns — pick a precedence and say
which. Add `stationlife` to the `window.__mirpur` debug hook (see
docs/DEBUG-HOOK.md) and keep everything already on that hook working.

## Acceptance (the advisor will check live)
1. `window.__mirpur.stationlife.state` reports berth and door state that
   matches what the trains are visibly doing.
2. Doors are shut before any train moves.
3. `E: board train` appears at an open door; riding moves the player to
   the next station; `E: get off` puts them on that platform at 14.5 m
   with normal controls.
4. The game starts and runs normally even if the metro/interior setters
   are not present yet.
5. The canopy reads dark green from the air (item 0).
6. FPS no worse than today (~24 at Mirpur 10).

Append dated sections to `docs/MAIN-WIRING.md` and `docs/DEBUG-HOOK.md`.
Report back with the state shape and the dwell timing you settled on.
