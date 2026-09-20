# P11-E — Platform screen doors that open, and riding the train

**Owner: `src/metro.js`, `src/main.js`, and a NEW file `src/stationlife.js`.**
`src/interior.js` is owned by another executor this pass — you may READ it
but must not write to it. Same for src/traffic.js, src/signs.js,
src/textures.js. Do NOT use the browser preview tools (shared, throttled);
the advisor verifies. Do not commit.

## Why
Owner report: "PSD doors don't open when a train berths — the train
arrives and you can't board." Everything needed for the game's best
feature is already built and none of it connects: real platforms, a
working gate line, trains that already dwell 6 s at every station
(`DWELL` in metro.js's `update`). Today the train pulls in behind a sealed
180 m screen and leaves again.

## Current state (verified by the advisor)
- `buildMetro()` (metro.js) creates 2 trains and animates them in
  `update(elapsed)`. Their `stopDistances` come from `stationList`; each
  train travels at `SPEED = 16` and dwells `DWELL = 6` at every stop. The
  `trains` array is local — **not exported**.
- The PSD is baked geometry: `bake('psdFrame', box(0.1, 1.55, PLATFORM_LEN), ...)`
  plus per-bay `psdGlass` panels, merged into one mesh per material bucket.
  Nothing is animatable.
- The PSD *collision* is a single full-length wall segment registered by
  interior.js (`wallLocal(... psdX, -PLATFORM_LEN/2 ... psdX, PLATFORM_LEN/2 ...)`,
  banded DECK_Y..DECK_Y+2.6). That is what stops the player reaching the
  track. **You do not own that file** — see the contract below.

## Build

### 1. Real door leaves in `src/metro.js`
Replace the continuous PSD run with frame + fixed panels + **sliding door
leaves** at the car-door pitch. A 6-car set of 19.8 m cars means doors
roughly every 4.5-5 m over the ~119 m train; place bays to match so the
leaves line up with the train that actually berths. Put the leaves in
their own `THREE.InstancedMesh` (or one merged mesh per platform with a
per-leaf offset you can write each frame) so they can slide — they must
NOT go into the static merged bucket. Two leaves per bay, sliding apart.
Budget: at most 2 extra draw calls per station.

Export what the new module needs. Add to `buildMetro()`'s return:
- `trains` — the existing array (or a read-only view exposing each train's
  world position, heading and direction),
- a `setDoorOpen(stationName, side, amount01)` (or equivalent) that drives
  the leaf offsets for one platform,
- `stopDistances` / whatever a caller needs to know which station a train
  is berthed at.

Raise `DWELL` from 6 to about **14 s** so boarding is actually possible.
Say in your report what that does to the headway.

### 2. `src/stationlife.js` — new module, the berth + ride state machine
```
createStationLife(scene3, metro, walkable, collision, player) -> { update(dt, player), interact(player), state }
```
- Each frame, work out for every station and side whether a train is
  berthed (train within ~2 m of the station centre along the track and
  effectively stopped) and how long it has been.
- Drive the door animation: open over ~1.2 s on berth, hold, close over
  ~1.2 s starting ~2.5 s before departure. Doors must be fully shut before
  the train moves.
- **Boarding**: while doors are open and the player is on that platform
  within ~3 m of a door bay, offer an interaction `E: board train`. On
  board, hide/lock the player (park them inside the car, following the
  train's position each frame) and show a HUD line naming the next stop.
- **Riding and alighting**: when the train berths at the next station and
  the doors open, offer `E: get off`. On alight, place the player on that
  station's platform beside the open door at `DECK_Y`, restore normal
  control, and make sure `player.feetY` is set so the walkable registry
  picks the platform up (not a fall to street level). Also auto-alight at
  the terminus so the player can never be stuck on a train forever.
- Expose the berth state for the interior executor (see contract).

Follow the interaction shape `src/interior.js#createInteriorSystem`
already uses (an `interactables` list of `{ position, label, range,
action }`, and `update` returning the HUD line) so main.js can wire this
the same way.

### 3. Wiring in `src/main.js`
Create the system after `interior` is created, call its `update(dt, player)`
in the frame loop, route the `E` key to it, and merge its HUD line with
the one `interior.update()` already returns (interior's line wins if both
are non-empty, or pick a sensible precedence and say which). Keep the
existing `window.__mirpur` debug hook working and add `stationlife` to it.

## Contract with the interior executor (do not break this)
The PSD collision wall belongs to `src/interior.js`, which you cannot
edit. Expose, on the object `createStationLife` returns:

```
state.doors  // Map keyed `${stationName}|${side}` -> { open: 0..1, bays: [localZ, ...] }
```

`side` is `-1` / `+1` matching interior.js's `buildPlatform(..., side)`.
`bays` are station-local Z centres of each door bay, and each bay is 1.8 m
wide. The interior executor is being briefed to read exactly this and open
its collision at those bays while `open > 0.5`. Publish this object on the
returned system AND on `window.__mirpur.stationlife` so it is testable
before the interior side lands. If you need to change the shape, say so
loudly in your report — do not silently deviate.

Until the interior side lands, the player will still be blocked by the
full-length collision wall. That is expected; do not work around it by
editing interior.js.

## Acceptance (the advisor will check live)
1. A train pulls into Mirpur 10; the screen doors slide open in line with
   the car doors, and shut before it leaves.
2. `window.__mirpur.stationlife.state.doors` reports open/closed correctly.
3. `E: board train` appears when standing at an open door, and riding
   moves the player to the next station.
4. Alighting leaves the player standing on the platform at 14.5 m with
   normal controls, not falling to the street.
5. FPS at Mirpur 10 no worse than today (~24-28); at most ~2 extra draw
   calls per station.

When done, append dated sections to `docs/METRO-REVIEW.md` and
`docs/MAIN-WIRING.md`, and report back to me — including the exact shape
of `state.doors` you shipped.
