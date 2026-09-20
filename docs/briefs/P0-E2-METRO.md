# P0-E2: metro rebuild review and fixes

Owner files: `src/metro.js` and `src/signs.js` ONLY.
Docs you own: `docs/METRO-REVIEW.md` (create). You may also overwrite the
four bogus `screenshots/metro-*.jpg` (they are all the same start frame).
Read first: docs/briefs/P0-COMMON.md, docs/NEXT-PASS-METRO.md (numbered
criteria 1-14), reference/metro/SPEC.md ADDENDUM (A1-A11, wins over the
body), reference/metro/interior/SPEC-INTERIOR.md ADVISOR ADDENDUM (B1-B5),
docs/REVIEW-2026-09-07.md.

## Step 1: honest review (do this BEFORE editing)
Capture real views and save to disk (see COMMON): 
- metro-street.jpg: start view looking north along the viaduct
- metro-pier.jpg: stand in the median 60 m south of Mirpur 10, look at a
  pier from 15 m
- metro-entrance.jpg: footpath, looking at a Mirpur 10 entrance core
- metro-platform.jpg: key 3
- metro-aerial.jpg: key 4
- metro-mirpur11.jpg: key 2, then pitch up ~0.3 rad to see the station
Then open reference photos 01, 13, 24, 26, 32 and interior i29. Write
docs/METRO-REVIEW.md with a table: criterion number (1-14, A1-A11, B1-B4),
PASS / FAIL / NOT VISIBLE, evidence (screenshot name), one-line note.

## Step 2: fix, in this priority order, in your files only
a. Canopy underside: from the platform the arch reads uniformly off-white;
   the `canopyUnder` shell (#4b4f4a dark ribbed) is not what you see. Check
   the offset sign in `buildCanopy` and which side each shell's normal
   faces; the top shell must be the top, the under shell visible from below.
   Ribs must be visible tubes (0.25 m), columns (round 0.45 m, ~9 m
   spacing, on the outer platform edge), green eaves trim, skylight strip.
b. Anything in NEXT-PASS-METRO D12-D14 that FAILS: grey plane, cylindrical
   piers, station parts outside the footprint. Add the build-time bounding
   box assertion from D14 (console.warn with the child name).
c. Piers: rectangular chamfered shaft with hammerhead head, 32 m spacing,
   in the median; pile-cap plinth. Confirm they exist along the whole
   alignment and are visible from the street.
d. Missing platform kit: half-height PSDs, OCS gantries + cantilever masts
   (A11), roundel signs on columns, platform floor to columns both sides.
e. Entrances per B1-B4: fascia boards dark green with entrance letter,
   stair+escalator core 4.5 m wide, green corrugated canopy under the
   soffit, cores also allowed under the viaduct not only on the footpath.
f. Textures: use `loadTextureSet` from src/textures.js (import only) for
   concrete (viaduct, piers, station frame) tinted to #C9C7BE and brick
   tinted red-brown for the concourse panels. Segment joint lines every 3 m.

## Constraints
- Keep `export const METRO = { SOFFIT_Y, DECK_Y, CONCOURSE_Y, PLATFORM_LEN }`
  and ADD to it: `PLATFORM_W, CANOPY_SPAN, TRACK_CENTRES, CONCOURSE_W,
  CONCOURSE_LEN`. The interior executor reads these at runtime.
- Keep `metro.stations[]` entries with `{ name, x, z, heading }`; add
  `entrances: [{ x, z, letter, side }]` (world coords of each entrance
  core's street-level foot) and `liftPads: [{x,z}]` if you place lifts.
  Write the exact shape into docs/METRO-REVIEW.md; the interior executor
  depends on it.
- Name every station child mesh `<part>:<station name>` (already the
  convention: `canopy-top:Mirpur 10`). Concourse floor slab must be named
  `concourse-floor:<name>`, each platform `platform-floor:<name>`.
- Do not edit streets.js (the road under the viaduct belongs to E1). If the
  pier still lands off the median, write the offset you need into
  docs/METRO-REVIEW.md for E1.
- Keep draw calls from growing by more than ~40; merge into the buckets.

## Verify
Re-capture all six screenshots after fixes (distinct md5s), update the
PASS/FAIL table with a second column "after". Report honestly what is
still FAIL.
