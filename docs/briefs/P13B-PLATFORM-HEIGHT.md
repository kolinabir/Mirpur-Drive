# P13-B — Rebase the platform onto the train floor

Owner ask (2026-09-08, follow-up to P13): "fix the platform height too".

## The bug, measured

`src/metro.js` defines `DECK_Y = SOFFIT_Y + GIRDER_DEPTH` (14.5 m) and its
own comment calls it "rail / platform level" — it is used as BOTH. That is
the error. On a real elevated metro the platform is level with the CAR
FLOOR, roughly 1.0–1.1 m above rail top; only the track slab is at rail
level.

What that costs today:

| Thing | World Y now | Should be |
|---|---|---|
| Rail top | `DECK_Y + 0.36` | unchanged |
| Train floor | `DECK_Y + 0.98` (train origin `DECK_Y + 0.36` + interior floor 0.62) | unchanged |
| Platform floor / walkable slab | `DECK_Y` | `DECK_Y + 0.98` — level with the train floor |
| Train door opening | `DECK_Y + 1.19` → `3.24` | unchanged |
| PSD opening (0 → 1.55 above platform) | `DECK_Y` → `DECK_Y + 1.55` | `DECK_Y + 0.98` → `2.53`, i.e. actually overlapping the train doorway |

So the player currently steps DOWN 0.98 m out of a train onto a platform,
and the platform screen doors only overlap the train's doorway for 0.36 m
of their height. Fix: raise everything that is *platform* by 0.98 m; leave
everything that is *track or structure* where it is.

## Item 1 — one source of truth for the level

In `src/metro.js`, hoist the train's own floor height into module scope and
derive the platform from it, so the two can never drift apart again:

```js
const TRAIN_Y_OFFSET = 0.36;          // train group sits this far above DECK_Y (rail top)
const TRAIN_FLOOR_LOCAL_Y = 0.62;     // saloon floor, train-local (src/traininterior.js)
const PLATFORM_Y = DECK_Y + TRAIN_Y_OFFSET + TRAIN_FLOOR_LOCAL_Y; // 15.48 — platform is level with the car floor
```

Export `PLATFORM_Y`, `TRAIN_Y_OFFSET` and `TRAIN_FLOOR_LOCAL_Y` on the
`METRO` object. `metro.js` must use `TRAIN_Y_OFFSET` where it currently
hardcodes `DECK_Y + 0.36` for train placement (two sites: the build loop and
`update()`), and `src/traininterior.js` must IMPORT `TRAIN_FLOOR_LOCAL_Y`
instead of keeping its own `FLOOR_Y` copy. `DECK_Y` keeps its current value
and meaning (rail top / structural deck) — fix its comment to say only that.

## Item 2 — what moves, what does not

MOVES to `PLATFORM_Y` (this is the definition of "platform level"):
- `PLATFORM_FLOOR_Y` in metro.js and every fixture already measured off it —
  platform slab, tactile strip, PSD walls/doors/bays, benches, canopy
  columns and roof (CANOPY_APEX is already "above platform floor"), platform
  signage, PIDs, station name boards, the lift core's platform stop.
- Every `METRO.DECK_Y` in `src/interior.js` that means "the platform deck":
  the walkable `slabLocal(...)`, the PSD barrier band, the platform guard
  walls, the bridge landing, the stair/escalator/lift TOP stop
  (`stops = [0, CONCOURSE_Y, DECK_Y]`), `needsRail`/`openAxis` height keys,
  and the ticket gate check at line ~978. Interior.js should import and use
  `METRO.PLATFORM_Y` for all of these.
- `src/traffic.js` platform pedestrians (`y: METRO.DECK_Y`, ~line 972) —
  otherwise they walk buried to the shins in the new slab.
- `src/main.js`: the arrival teleport (`METRO.DECK_Y + 1.68`, ~line 510),
  the Digit3 platform preset, and the sign placement at ~line 811 if it is
  platform-mounted. NOTE: main.js has UNCOMMITTED owner edits — change only
  these lines, revert nothing, reformat nothing.
- `src/stationlife.js`: `alight()`'s `player.feetY` / `position.y` pinning,
  the `GATEWAY_FEET_TOL` comparison, and the two `interactables` marker
  positions. (P13 is editing this file first; this pass starts only after
  P13 has landed.)

DOES NOT MOVE (structure and track, all correctly on `DECK_Y` today):
- track plinths and rails, the girder/deck extrusion, the parapet,
  the conductor bar, the galvanised catenary portal frames
  (`DECK_Y + 2.7 / 5.4`), the viaduct itself, and the trains.

## Item 3 — the ramp that gets steeper, and the clearances

Raising the platform 0.98 m while `CONCOURSE_Y` stays at 8.0 makes the
concourse→platform run climb 7.48 m instead of 6.5 m. Over interior.js's
current `RUN_PLATFORM = 5.5` (an 11 m run) that goes from 30.6° — exactly
escalator gradient — to 34.2°, which is too steep.

Lengthen the run to hold ~30°: `RUN_PLATFORM = 6.5` (a 13 m run, 7.48/13 =
29.9°). Then re-check everything derived from it, in particular
`landingZ = 12 + (RUN_PLATFORM + 1)` and the platform-level landing slabs,
and confirm the longer run still lands inside the 180 m platform and does
not foul the PSD line or a canopy column. `RUN_ENTRANCE` (street→concourse)
is NOT affected — the concourse does not move — so metro.js's
`STAIR_RUN = 14` stays as is.

Then verify these clearances after the move, and write the measured numbers
into the doc:
1. Headroom under the canopy from the new platform floor (should still be
   the intended CANOPY_APEX 6.5 / spring 2.0).
2. The canopy does not now foul the catenary portal beam at `DECK_Y + 5.4`.
3. The station box roof / concourse ceiling still clears the new platform.
4. The PSD opening vs the train doorway overlap (state both ranges).

## Acceptance — verify in the browser, do not hand back unverified

`npx vite --port 5183 --strictPort`, drive via `window.__mirpur`
(docs/DEBUG-HOOK.md; held keydowns, not taps).

1. Stand on a platform (Digit3): feet at `METRO.PLATFORM_Y`, not floating,
   not sunk. Screenshot.
2. A berthed train's floor is FLUSH with the platform — screenshot straight
   at an open door showing the floor line continuous, no step. This is the
   headline acceptance shot.
3. Board, ride one stop, alight: you walk out level, `player.feetY ===
   METRO.PLATFORM_Y`, and you do not fall or get shoved by collision.
4. Walk the full route street → concourse → platform on stairs, escalator
   AND lift: each arrives on the platform at the new height with no step,
   no gap, no fall-through. Screenshot the top of the ramp.
5. Platform pedestrians (traffic.js) stand ON the new floor.
6. Nothing at street or track level moved: screenshot the viaduct from the
   street and compare with an existing screenshot in `screenshots/`.

Write `docs/PLATFORM-HEIGHT.md` (the numbers above, before/after, what moved,
the ramp regrade, remaining known gaps) and append one row to the table in
docs/HANDOFF.md.

## Fences

You own: `src/metro.js`, `src/interior.js`, `src/traffic.js` (the platform
pedestrian Y only), `src/stationlife.js` (the DECK_Y→PLATFORM_Y lines only),
`src/traininterior.js` (the FLOOR_Y import only), `src/main.js` (the three
lines named above ONLY — it has uncommitted owner edits), plus
`docs/PLATFORM-HEIGHT.md`, `docs/HANDOFF.md` (one appended row),
`screenshots/p13b-*`. Do not `git commit`. Do not touch `src/player.js` or
`src/city.js`.
