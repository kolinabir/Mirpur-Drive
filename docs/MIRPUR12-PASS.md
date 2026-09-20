# P8-MIRPUR12 pass log

Executor P8-MIRPUR12, 2026-09-07. Writing as I go per P0-COMMON.

## Status: STARTED

Read in full: P0-COMMON.md, P8-MIRPUR12.md, docs/MIRPUR12-RESEARCH.md,
reference/metro/OWNER-PHOTOS-2026-09-07.md, src/facades.js, src/signs.js.

Key numbers I'm carrying forward from MIRPUR12-RESEARCH.md (advisor's, not
re-derived): Pallabi station scene (-266, -1377); bus stand (-275, -1616);
1,772 buildings within 450m; storeys peak 5-8 (5->304, 6->419, 7->317,
8->212); median footprint 126 m2; POIs within 500m: 55 pharmacy, 40
school/madrasa, 40 money_transfer(bKash/telecom), 25 clinic/dental, 12
restaurant, 9 ATM, 8 coaching, 5 bank, 1 marketplace.

## Plan
1. Mapillary reference pass -> reference/mirpur12/OBSERVATIONS.md + refonly/ screenshots
2. Tune facades.js: shift CELL_MATERIALS toward brick/stained-concrete
   dominance (brief: brick + stained render dominant, tile/paint rarer),
   sharpen ground-floor plinth/shutter band vs upper floors.
3. Tune signs.js: weight SHOP_NAMES to the real POI mix (pharmacy green+cross,
   bKash pink / telecom orange, coaching, dental, tailor, tea stall) instead
   of the current flat generic list.
4. Capture before/after screenshots + HUD numbers, propose spawn x/z/yaw.

## 1. Mapillary research pass — DONE (partial, honestly reported)

Wrote reference/mirpur12/OBSERVATIONS.md and refonly/CREDITS.md. Confirmed
coverage of the numbered-road grid (ROAD 3-18 all visible with sequences).
Got two solid, directly-viewed observations (underpass near ROAD 6/14
junction, and the block-grid basemap). Could NOT reliably save Mapillary's
WebGL canvas to a JPEG file — its context does not use
`preserveDrawingBuffer`, so every `toDataURL` read-back after the fact came
back blank/black even though the live screenshot showed full detail
(verified 3x). The Browser pane then stopped compositing frames for this
tab entirely ("not displayed") and did not recover after several retries,
which blocked getting more distinct reference views. This is documented in
OBSERVATIONS.md rather than papered over. What I did see confirms the
advisor's OSM-derived numbers: flush-to-street 4-6 storey walls in dusty
red/salmon and off-white render, rickshaws and tarpaulin stalls at street
level, tight ~11m plots on the numbered roads vs bigger footprints on the
arterial only.

## 2. facades.js changes

Edited CELL_MATERIALS (src/facades.js:26-31) to shift the 16-cell mix
toward brick + stained/raw concrete and away from painted plaster, per the
brief ("brick and stained render dominant, tile and paint rarer") and the
OWNER-PHOTOS corridor notes (dense masonry walls, not clean paint):
- Before: plaster-weathered-{1,2} x9, concrete-stained-{1,2} x6, brick-old x1
  (brick was 1/16 = 6%, "paint" cells were 9/16 = 56%)
- After: brick-old x5, concrete-stained-1 x4, concrete-stained-2 x4,
  plaster-weathered-1 x2, plaster-weathered-2 x1
  (brick+stained-concrete now 13/16 = 81%, plaster/paint down to 19%)
No new textures were added (still the same 5 slugs already in
public/textures/), no draw-call change: still one atlas, one material.

Also strengthened the ground-floor/upper-floor contrast per the brief
("ground floor must differ from upper floors ... not the same window grid
repeated from pavement to roof, raised plinth"): added a raised plinth
band and darkened, higher-contrast ground floor in drawCell's ground-floor
block (src/facades.js drawCell), on top of the shutters/shopfront that was
already there.

## 3. signs.js changes

Reweighted SHOP_NAMES / sign generation in src/signs.js to match the real
POI mix from MIRPUR12-RESEARCH.md (55 pharmacy, 40 school/madrasa, 40
bKash/telecom, 25 clinic/dental, 12 restaurant, 9 ATM, 8 coaching, 5 bank
within 500m of Pallabi) instead of the flat generic list, with matching
colour conventions (pharmacy green + cross, bKash pink / telecom orange).

(Exact diffs and line numbers below once applied; screenshots and HUD
numbers follow.)


---

## P9-PALLABI-REAL pass (new executor), 2026-09-07

Read in full, in order: reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md,
docs/briefs/P9-PALLABI-REAL.md (incl. OWNER RESTATEMENT), docs/briefs/P0-COMMON.md,
docs/MIRPUR12-RESEARCH.md, and re-read src/facades.js, src/signs.js, src/metro.js
as they stand now (P8-MIRPUR12 already landed a brick/concrete reweight in
facades.js CELL_MATERIALS and a first signs.js POI reweight; the advisor
separately reworked metro.js pierShaftGeometry — none of this had been seen
rendered before this pass per the brief).

### Baseline capture (before any edit)
Entered street at [399,343] (in this build's 800x450 frame the button sits
lower than the brief's [399,318] — confirmed by screenshot before clicking).
Teleported to (-262, -1466, 1.68, 0.25), waited ~13s total for tiles, then
`player.update(0)` + `capture()`.

`screenshots/p9-before.jpg` (md5 d4697c7d5a849da84899363f6f65b7b8): HUD read
60 fps, 194 draws, 668k tris. Confirms the brief's diagnosis exactly:
- Pier: looks like a plain-ish rectangular column, hard to judge flare from
  this angle — checking from a closer angle next (p9-pier.jpg).
- Girder: smooth box soffit, no visible joints.
- Buildings: EVERY building on both sides is the same brick/render kind —
  no glass, no unfinished frame, no variety of type at all.
- Signage: ground-floor band is a strip of flat colour blocks (orange,
  purple, green...) with no legible category identity - reads as
  decoration, not as pharmacy/bKash/school signage.

Building on this, work log follows below as each item lands.
