# P13 — Rideable train interior (MRT Line 6 coach)

Owner ask (2026-09-08): "metro interior should look the same! find and make
it! also player should be move in the metro interior."

Reading: riding a train today (src/stationlife.js `board`/`updateRiding`)
hard-pins the player to the train's ORIGIN every frame — no interior geometry
exists (src/metro.js `buildTrain()` bakes an exterior shell only, all boxes
single-sided, so from inside you see straight through the car), and the
player cannot move a centimetre while aboard. Two deliverables:

1. A coach interior that looks like the real Line 6 coach.
2. Walking around inside it while the train runs.

## Reference (look-only, never ship as texture)

`reference/metro/interior/refonly/dstar02_female_coach.jpg` is the money
shot of a real Line 6 saloon. What it shows, and what must be modelled:

- Longitudinal bench seats along BOTH sides, cushions a muted blue-violet,
  white GRP bucket dividers between every 2–3 seats, curved white armrest /
  stanchion loops rising from the bench ends up to the ceiling rail.
- Floor: pale grey-lilac vinyl, slightly darker aisle strip.
- Walls and ceiling: off-white / cream. Ceiling has a flat raised centre
  panel with recessed linear light strips down each side of it and AC
  return grilles.
- Vertical stainless grab poles (~40 mm) floor-to-ceiling at the bench ends
  beside every doorway; horizontal grab rails over each bench with grey/white
  hanging strap RINGS at roughly 0.7 m pitch.
- Door pockets: cream leaves, a RED vertical stripe at the leading edge,
  a large glass window in each leaf, and a small LED info strip above the
  doorway. Big tinted side windows above the seat backs.
- Gangway through to the next car at each car end (corrugated bellows ring,
  walk-through opening).

## Hard geometric facts (do not re-derive, do not drift)

All in TRAIN-LOCAL coordinates: x across the car, z along it, y up from the
train group's own origin. `metro.js` sets each train's `position.y =
METRO.DECK_Y + 0.36` (= rail top) and `rotation.y = heading (+PI when
dir < 0)`.

| Thing | Value | Source |
|---|---|---|
| Cars | 6 | metro.js TRAIN_CARS |
| Car length | 19.8 m | metro.js TRAIN_CAR_LEN |
| Car gap | 1.0 m | metro.js TRAIN_CAR_GAP |
| Car centre z | `(i - 2.5) * 20.8` | buildTrain() |
| Body width / height | 2.95 / 3.5, body box spans y 0.55 → 4.05 | buildTrain() |
| Exterior window band | y 1.9 → 2.9, length CAR_LEN - 3.4 | buildTrain() |
| Doors per side per car | 4, at `z_car - CAR_LEN/2 + (CAR_LEN/4)*(d+0.5)`, leaf box 1.25 wide, y 0.83 → 2.88 | buildTrain() / `trainDoorZs()` |
| Whole-set length | 6*19.8 + 5*1.0 = 123.8 m | `g.userData.length` |

Derived interior envelope — USE THESE:
- Interior floor top `FLOOR_Y = 0.62` (just above the body box bottom).
- Interior half width `IW = 1.40` (0.075 wall lining each side).
- Ceiling `CEIL_Y = 2.98` (raised centre panel to 3.06) → 2.36 m headroom.
- Window openings cut in the interior lining at y 1.95 → 2.85 so you look
  out through the exterior window boxes (whose inward faces are backface-
  culled, i.e. invisible from inside — the interior lining IS the visible
  wall).
- Door openings 1.30 wide, y `FLOOR_Y` → 2.70, at the exact `trainDoorZs()`
  pitch above so interior doors line up with exterior doors and the PSDs.
- Seats: cushion top `FLOOR_Y + 0.45`, depth 0.48 (front face at
  |x| = 0.92), seat back up to `FLOOR_Y + 1.20`, benches fill the runs
  BETWEEN door openings, cut back 0.35 m either side of each doorway.
- Aisle: clear between |x| ≤ 0.92; widens to |x| ≤ 1.35 in the 1.4 m-long
  door pockets.

KNOWN PRE-EXISTING MISMATCH — do not try to fix it in this pass, just note
it in the doc: the platform slab is at `DECK_Y` while the train floor lands
at `DECK_Y + 0.98`, and the PSD opening (0 → 1.55 above deck) only partly
overlaps the train's door opening. That is a metro.js/interior.js station-
height issue that predates this brief. Board/alight are teleports, so they
absorb it; write the discrepancy into docs/TRAIN-INTERIOR.md with the
numbers above so a later station pass can rebase it.

## Item 1 — `src/traininterior.js` (new file, you own it)

`export function buildTrainInterior()` → a single `THREE.Group` built ONCE
for the whole game (there are 6 trains; the player can only be in one, and
the exterior shell hides the interior from outside, so exactly one interior
instance is built and re-parented to whichever train is being ridden).

Follow `buildTrain()`'s own construction style exactly: box geometry baked
into per-material buckets and merged with the file's merge helper, index
order (0,2,1),(0,3,2) for any hand-built quads (repo-wide winding rule, see
docs/HANDOFF.md), MeshStandardMaterial in the muted metro.js palette.
Target ≤ ~12 draw calls for the whole 6-car interior.

Returned object (this is the contract stationlife.js codes against):

```js
{
  group,               // THREE.Group, interior geometry in train-local space
  FLOOR_Y, IW, CEIL_Y, // the constants above
  totalLen,            // 123.8
  doorZs,              // [z, ...] the same list trainDoorZs() produces
  setDoorSide(side, amount01), // slide the interior door leaves on one side; side is metro.js's +1/-1 platform side, amount 0 shut → 1 open
  clampLocal(lx, lz),  // -> {x, z} the nearest legal standing point in the saloon (aisle + door pockets + end walls), radius 0.32 already applied
  attachTo(trainObj),  // add the group to that train (removes it from any previous parent first)
  detach(),
}
```

Lighting: the saloon is enclosed, so ceiling light strips must be emissive
(they will not be lit by the scene's sun). Add at most 3 low-cost
`THREE.PointLight`s parented INSIDE the group (they travel with it and only
exist while riding) so seats and poles read as lit — do not touch the
scene's global lighting.

## Item 2 — walking aboard (`src/stationlife.js`, you own it)

- Keep a local position `ride = {x, z}` and a local velocity in
  train-local metres. `board()` seeds it from the player's actual world
  position via `trainObj.worldToLocal(...)` (so you board at the door you
  were standing at) clamped through `clampLocal`, then `attachTo(trainObj)`.
- `updateRiding` needs `dt` — thread it through from `update(dt, player)`.
  Each frame:
  - read movement intent straight off `player.keys` (`KeyW/S/A/D`, arrows,
    `ShiftLeft/Right` to run) and `player.yaw` — the same accel model as
    `Player.update()`'s walking branch (WALK 3.1 / RUN 7.4 is too fast in a
    123 m saloon; use ~1.6 / 3.4 and say so in the doc);
  - the intent is a WORLD-space direction: rotate it into car-local by the
    train's own yaw (simplest correct route: build the world direction, then
    `trainObj.worldToLocal` two points / use `trainObj.getWorldQuaternion`
    — do NOT hand-roll a heading that ignores metro.js's `+PI` dir flip);
  - integrate, `clampLocal`, then set the player's world position with
    `trainObj.localToWorld(new THREE.Vector3(x, FLOOR_Y, z))`;
  - `player.feetY` = that world y; `position.y = feetY + RIDE_EYE_HEIGHT`
    plus a small sway/bob so the ride reads as moving;
  - rotate `player.yaw` by the train's heading delta since last frame, so
    the player keeps facing the same way relative to the car through curves;
  - keep the existing camera-sync tail (`camera.position.copy` /
    `rotation.set`) — `player.update()` is still skipped by main.js.
- Drive `setDoorSide(ts.side, ts.doorAmt)` for the ridden train every frame
  so the interior doors open with the PSDs, and shut them on detach.
- `alight()`: keep the existing feetY/DECK_Y pinning, but put the player
  down beside the door they are actually standing at — convert their current
  world x,z into station-local via the file's existing `worldToLocal`, keep
  that local z (clamped to ±(PLATFORM_LEN/2 - 2)), and set local x to
  `platformCx(side)`. `detach()` the interior.
- HUD line while riding: keep the next-stop / "E: get off" text, and mention
  you can walk about.
- The file's existing feature-detection discipline stands: nothing here may
  throw if `metro.trains` is missing.

## Item 3 — main.js

Should need NO change (the interior parents itself under a train that is
already in `metro.group`). If you do need one, keep it to wiring only and
say why in the doc. Expose nothing new on `window.__mirpur` except, if it
helps you verify, `stationlife.state.rideLocal`.

## Acceptance — verify in the browser, do not hand back unverified

Run `npx vite --port 5183 --strictPort`, drive it through
`window.__mirpur` (see docs/DEBUG-HOOK.md — synthetic keydown must be HELD
across an awaited delay, a tap does nothing).

1. Board a berthed train (teleport to a platform, wait for doors, `E`).
2. Screenshot the saloon looking down the car: benches both sides, poles,
   strap rings, lit ceiling, doors, city visible through the windows. Save
   as `screenshots/p13-train-int-*.jpg`. Compare against the reference photo
   and say honestly where it differs.
3. Hold `KeyW` for 2 s: `stationlife.state` local z must change and the
   camera must move down the car, while the train keeps running (world
   position changes on both counts).
4. Walk into a bench / an end wall: the clamp must stop you, no falling out
   of the car, no falling through the floor.
5. Ride to the next station: doors open on the correct side, `E` gets you
   off onto the platform at the door you were standing at, feet on the deck.
6. Report frame time before/after boarding (draw calls added).

Write `docs/TRAIN-INTERIOR.md` (what was built, the constants, the
platform/floor height mismatch note, screenshots, what is still wrong) and
append a row to the table in docs/HANDOFF.md.

## Fences

You own: `src/traininterior.js` (new), `src/stationlife.js`,
`docs/TRAIN-INTERIOR.md`, `docs/HANDOFF.md` (append one row only),
`screenshots/p13-*`. Do NOT edit `src/metro.js`, `src/interior.js`,
`src/player.js`, `src/city.js`. There are uncommitted owner changes in
`index.html`, `src/main.js`, `docs/HANDOFF.md`, `docs/BIJOY-DISTRICT.md` —
do not revert or reformat them, and do not `git commit`.
