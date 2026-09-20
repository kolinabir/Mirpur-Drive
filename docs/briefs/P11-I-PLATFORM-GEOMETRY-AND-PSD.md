# P11-I — Reconcile the platform floor, build real PSD doors, place the signs

**Owner: `src/metro.js` and `src/interior.js`.**
Do NOT touch src/main.js, src/stationlife.js, src/traffic.js, src/signs.js,
src/textures.js — a concurrent executor owns main.js + a new
src/stationlife.js this pass, and signs.js/traffic.js just landed. Do NOT
use the browser preview tools (shared, throttled); the advisor verifies.
Do not commit.

## Item 0 (do this first — it is a real bug the advisor measured live)

The two files each build their own platform floor, at different heights and
different widths, and they disagree:

- `src/metro.js` (~line 878):
  `bake('platformFloor', box(floorW, 0.4, PLATFORM_LEN), [cx, DECK_Y + 0.2, 0])`
  — a 0.4 m thick slab centred at 14.7, so its **top face is at 14.9**,
  running from local X 1.95 (`TRACK_GAUGE_OFFSET`) out to 10.7
  (`CANOPY_SPAN/2 - 0.3`) — about 8.75 m wide.
- `src/interior.js#buildPlatform`: a walkable slab at **DECK_Y = 14.5**,
  `PLATFORM_W = 5` wide, centred at `+-(TRACK_CENTRES/2 + 0.1 + PLATFORM_W/2)`,
  plus its own visible floor box.

Two consequences, both confirmed live at Mirpur 10:
1. **You walk 0.4 m sunk into the visible floor.** The player stands at
   14.5; the floor you can see has its top at 14.9.
2. **There is visible floor you fall through.** I probed
   `walkable.supportHeightAt` straight across the platform: support exists
   only for local X -2.5 .. -7.05. From -7.05 out to -10.7 there is a
   3.6 m wide strip of painted floor, running the full 180 m of both
   platforms, with no walkable support under it. Walk out toward the canopy
   columns and you drop to the street.

**Fix:** make one file own the platform deck and make the other match it
exactly. The advisor's preference: keep metro.js's *width* (the floor
really does run out to the canopy columns — "so there is no void beyond
the yellow line" as its own comment says) and interior.js's *height*
(14.5 = `DECK_Y`, which is what the whole walkable/collision system and
the stair cores are built around). So:
- metro.js: drop the slab so its top face is exactly `DECK_Y`.
- interior.js: widen the walkable slab to cover the full floor out to the
  canopy columns, and delete its now-duplicate visible floor box (or keep
  the box and delete metro.js's — pick one owner and say which in your
  report; do not leave two coplanar slabs z-fighting).
- Same treatment for the **yellow tactile strip**, which is currently baked
  twice: metro.js at `DECK_Y + 0.42`, interior.js at `DECK_Y + 0.01`. One
  strip, one owner.
- Re-check the platform's outer collision wall in interior.js — it is
  currently at `side * (trackHalf + 0.1 + PLATFORM_W)`, which will be in
  the wrong place once the deck widens.

## Item 1 — Platform screen doors that can actually open

Today the PSD is baked as one continuous 180 m run
(`bake('psdFrame', box(0.1, 1.55, PLATFORM_LEN), ...)` plus per-bay glass)
merged into a static bucket, and interior.js registers one continuous
collision wall along it. Nothing can open.

In **metro.js**: split the run into fixed panels plus **sliding door
leaves** at the train's door pitch. The trains are 6 cars x 19.8 m; place
door bays so the leaves line up with where a berthed train's doors are.
Two leaves per bay, sliding apart, each bay ~1.8 m clear when open. Put the
leaves in their own `InstancedMesh` (or one mesh whose per-leaf offsets you
rewrite) so they can move — they must NOT go in the static merged bucket.
Budget: at most 2 extra draw calls per station.

Export from `buildMetro()`:
```
setPlatformDoors(stationName, side, amount01)  // 0 = shut, 1 = fully open
platformDoorBays(stationName, side) -> [localZ, ...]   // bay centres, station-local Z
trains                                          // the existing array, or a read-only view
```

In **interior.js**: replace the single full-length PSD collision segment
with per-bay segments, and expose
```
setPsdOpen(stationName, side, amount01)
```
which degenerates the segments at the door bays (the existing AFC-gate
trick — collapse a segment to zero length and `resolveCollision` skips it)
while `amount01 > 0.5`, and restores them otherwise. Get the bay positions
from metro.js's `platformDoorBays`.

**A concurrent executor is writing `src/stationlife.js`, which will call
both of these setters.** Those two exported signatures are a contract —
implement them exactly as written above. If you must deviate, say so
loudly in your report; do not silently change the shape.

## Item 2 — Place the wayfinding signs

`src/signs.js` just gained these factories (see the dated section in
docs/METRO-REVIEW.md for exact signatures):
`makeLineStripMap`, `makeDirectionBoard`, `makePlatformNumberSign`,
`makeExitSign`, `makeNextTrainDisplay`, plus a `LINE_STOPS` export.
**Import them; do not edit signs.js.** Place them in interior.js:

- A **strip map** on the concourse wall, unpaid side near the TVM bank, at
  eye height (~1.6 m above the deck), and one on each platform.
- A **direction board** over the top of each paid-side platform-access
  core: platform A toward one end of the line, platform B toward the
  other. Get the sense right — work out from the station heading and the
  track geometry which side is northbound (toward Uttara North) and which
  is southbound (toward Motijheel), and state your reasoning in the
  report. Getting this backwards is worse than not having the sign.
- A **platform number sign** at each platform head.
- An **exit sign** over each entrance core's concourse-side landing,
  listing that entrance's letter.
- A **next-train display** hung over each platform. Static rows are fine;
  stationlife.js may drive it later via `mesh.userData.update(lines)`.

Signs must not intrude into the walkable envelope or block a door gap.

## Acceptance (the advisor will check live)
1. Standing anywhere on either platform, `player.feetY` matches the floor
   you visibly stand on, and there is no strip of floor you fall through.
2. No z-fighting anywhere on the platform deck; exactly one tactile strip.
3. `window.__mirpur.metro.setPlatformDoors('Mirpur 10', -1, 1)` visibly
   opens the doors; `interior.setPsdOpen(...)` lets the player walk
   through the bay and blocks them again at 0.
4. The signs are readable in place and the direction boards point the
   right way.
5. Draw calls per station up by no more than ~6 total; FPS no worse.

Append dated sections to `docs/METRO-REVIEW.md` and
`docs/INTERIOR-PASS.md`. Report back with the exact exported signatures.
