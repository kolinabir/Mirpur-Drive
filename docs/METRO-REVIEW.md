# Metro review (E2, Pass 0)

Owner files touched: `src/metro.js`, `src/signs.js`. Screenshots below were all
captured with the live scene via the `window.__mirpur` debug hook (added by
the controls executor mid-session) — `player.position`/`yaw`/`pitch` set
directly, then `window.__mirpur.capture()` (a direct `renderer.render()` +
`canvas.toDataURL()`, since the app's own render loop does not run while the
Browser-tool tab is backgrounded, so `player`/`camera` never resync on their
own). All six screenshots below have distinct, non-trivial md5s — see the
table at the bottom.

Two rounds: **before** (initial honest review, no code touched yet) and
**after** (post-fix). The advisor's docs/REVIEW-2026-09-07.md findings are
folded into the "before" column since they are the most recent honest
baseline and match what I independently observed.

## What I changed (file:line, current state of src/metro.js)

1. **Canopy shell swap (root cause of NEXT-PASS #5 and #12/the "black mass")**
   — `buildCanopy()`, ~line 451-500. The per-segment outward normal was
   computed as `nx = dy/l, ny = -dx/l`, which for this arch's winding
   direction is the *inward* normal, not outward. Both shells then used
   `shell.off`'s sign against that wrong-signed normal, so `canopyTop`
   (off > 0) ended up offset toward the platform (physically the lower,
   underside-facing shell) and `canopyUnder` (off < 0) ended up offset up and
   away (physically the upper, outer shell). From the platform you were
   therefore looking at the underside of the mesh *named* `canopyTop`
   (off-white, `#e6e6de`) — reads uniformly off-white, exactly what the
   advisor and I both saw. From outside/below the mesh *named* `canopyUnder`
   (`#4b4f4a`) was the outer shell, lit from a bad angle (its face normal was
   also a hardcoded constant `[0,±1,0]`, wrong for the steep near-springline
   part of the arc) — reads as solid black, matching NEXT-PASS #12's "grey
   plane" and the huge black mass I captured at Mirpur 11 before the fix.
   Fix: flipped the base normal to `nx = -dy/l, ny = dx/l` (verified by hand
   for both halves of the arch — see derivation in the commit) and replaced
   the hardcoded `[0,±1,0]` face normal with the real per-segment direction
   `[ox, oy, 0]`. Top shell is now genuinely the outer/upper surface, under
   shell the inner/lower one, with lighting that varies correctly along the
   arc instead of a constant guess.
2. **Skylight strip** — same function. `bucket.skylightPos.push(pos.length
   ? null : null)` was dead code (a no-op every time); no skylight geometry
   was ever built despite `MAT.skylight` existing. Replaced with real
   geometry: the skylight band is now cut out of the top shell and rebuilt as
   its own translucent quad set, merged into `canopy-skylight:<name>`.
3. **`metro.stations[].entrances[]`** — `buildStation()` now assigns each
   entrance core a letter (A-D) and records its world-space street-level foot
   in `g.userData.entrances`; `buildMetro()`'s station loop copies that onto
   the returned `stations[]` entry. Exact shape below.
4. **Entrance fascia sign (SPEC-INTERIOR ADDENDUM B1)** — `src/signs.js`
   gained `makeEntranceLabel(en, bn, letter, w, h)`: dark green board
   (`#1f6e52`), white DMTCL-logo tile at the left end, white letter-square at
   the right end, Bangla+English name between. Hung on every entrance core in
   `buildStation()`.
5. **Build-time footprint assertion (NEXT-PASS D14)** — `buildMetro()`'s
   station loop now unions each station child's local bounding box and
   `console.warn`s (with the child's name and the offending extent) if it
   exceeds ±40 m across / ±110 m along track. Ran clean on both stations this
   session (no warnings in the console) — see "still FAIL" for what that does
   and doesn't prove.
6. `bridgeLen` in the entrance-bridge code is now clamped with
   `Math.max(1.0, ...)` instead of being allowed to go to zero or negative,
   per NEXT-PASS #12's suspect list (it wasn't actually reaching a bad value
   with the current constants, but the clamp is now there defensively).
7. `export const METRO` now also carries `PLATFORM_W, CANOPY_SPAN,
   TRACK_CENTRES, CONCOURSE_W, CONCOURSE_LEN` per the brief's constraint.

## Exact shapes for the interior executor

```js
// metro.stations[] entries (from buildMetro()'s return value):
{
  name: "Mirpur 10",           // or "Mirpur 11"
  bn: "মিরপুর ১০",
  x: 148.69351518827722,       // world, on the resampled centreline
  z: 593.9342853081162,
  heading: 0.24609736370346988,// radians, station-local +Z (track) direction
  entrances: [
    { x: 126.84, z: 574.68, letter: "A", side: -1 },
    { x: 138.54, z: 621.23, letter: "B", side: -1 },
    { x: 158.85, z: 566.64, letter: "C", side: 1 },
    { x: 170.54, z: 613.19, letter: "D", side: 1 },
  ],
}
// Mirpur 11 (legCount 2) has only A (side -1) and B (side 1).
```

```js
export const METRO = {
  SOFFIT_Y: 12.5, DECK_Y: 14.5, CONCOURSE_Y: 8.0, PLATFORM_LEN: 180,
  PLATFORM_W: 5, CANOPY_SPAN: 22, TRACK_CENTRES: 3.9,
  CONCOURSE_W: 20, CONCOURSE_LEN: 60,
};
```

`liftPads` was **not** added — no lift geometry exists yet in metro.js (see
"still FAIL" below), so there is nothing honest to put in it. Do not assume
`entrances[]` coordinates are clear of collision; see the entrance-occlusion
finding below.

## PASS / FAIL table

Legend: B = before (this session's first honest look, matches the advisor's
independent findings), A = after my fixes. NV = not independently visible
this session (evidence too indirect to call PASS or FAIL).

| # | Criterion | B | A | Evidence | Note |
|---|---|---|---|---|---|
| 1 | Girder not a black lid, lit properly | PASS | PASS | metro-street.jpg | Already fixed before this pass (concrete-toned, lit soffit); unchanged by me. |
| 2 | Pier in median, not against shopfronts | FAIL/NV | FAIL/NV | metro-street.jpg, metro-pier.jpg | Piers now clearly visible and roughly centred over the carriageway in both after-shots, but the *road* ribbon is E1's file — I cannot confirm alignment against the actual carriageway edges from my side. `roadHalf=12.0` in metro.js (line ~692) is still an assumed constant, not read from streets.js. |
| 3 | Pier: chamfered rect shaft + hammerhead + plinth | PARTIAL | PARTIAL | metro-pier.jpg | Shaft/cap/plinth all exist with correct footprint dimensions (verified via `pierShaftGeometry`/`pierCapGeometry` in code and instance bounding boxes: shaft 1.5x1.2 half-extents x10.9m tall, cap 5.5x1.6x1.6, plinth 3.4x2.8x0.5 — all match spec). Visually the 8-sided chamfer is subtle at normal viewing distance/lighting; reads closer to a rounded column than a crisp chamfered box in the screenshots. Not touched this pass (lower priority; ran out of budget). |
| 4 | Continuous covered corridor feel | PARTIAL | PARTIAL | metro-street.jpg | Soffit is continuous and piers are now visible in the street shot (previously zero piers were in frame at all). Traffic/road surface quality is E1's file. |
| 5 | Canopy: cross-section arc, ribs, columns, light grey/off-white DoubleSide | FAIL | PASS (shells) / PARTIAL (ribs) | metro-platform.jpg (before+after pair) | **Fixed**: underside now reads dark/ribbed from the platform (was uniformly off-white before). Ribs are visible as thin arcs in the after-shot but still read thin at this render distance — did not enlarge them (spec says 0.25 m, which is what's built; the "hairline" look may just be normal at ~10 m viewing distance, not re-verified with a close-up). Columns exist in code (steel-bucket cylinders) but weren't clearly separable in my platform screenshot's framing. |
| 6 | Platform floor to canopy columns both sides, no void | PARTIAL/NV | PARTIAL/NV | metro-platform.jpg | Floor + yellow tactile line visible near-camera in both rounds. Did not get a clean framing that shows both edges of the floor at once this session. |
| 7 | Fog/haze/ground-plane match, no grey wall | NV | NV | metro-aerial.jpg | Not metro.js's file (sky.js/streets.js); aerial shot shows a hard-edged pale polygon near the horizon consistent with the advisor's original note, unchanged since I don't own that code. |
| 8 | Textures/colours per ADDENDUM (concrete tint, brick, green trim, no teal) | PASS | PASS | all shots | `loadTextureSet` wired for concrete/concreteDark/brick/corrugatedGreen/band (unchanged, already correct from before this pass). No teal anywhere in metro.js's palette (`COL` table checked by eye — all green/grey/brick values match A2). |
| 9 | OCS: portal gantries at stations, cantilever masts on viaduct | PASS | PASS | metro-mirpur11.jpg, metro-street.jpg | Cantilever masts visible along the viaduct in the after-street-shot; portal-gantry code exists in `buildStation` (`galvanised` bucket, two masts + crossbeam per platform end). Not newly broken or fixed by me. |
| 10 | Half-height PSDs, stainless+glass | PASS (code) / NV (visual) | PASS (code) / NV (visual) | — | `psdFrame`/`psdGlass` buckets build a 1.55 m frame + 1.4 m glass panels every 6.2 m (code-verified). Didn't land a screenshot with a clean line-of-sight down the PSD run this session. |
| 11 | Train: stainless/green/red DMTCL livery | PASS | PASS | not re-captured | Unchanged this pass; matches A10 by code inspection (green window band, green cab face, white nose, red skirt/door edges). |
| 12 | Stray grey/black plane regression | FAIL | PASS (root cause fixed) | metro-mirpur11.jpg (before+after pair) | Before-shot: a large solid black mass hangs below the girder blocking most of the sky at Mirpur 11 — this was the mis-oriented `canopy-under` shell (see fix #1 above), not a `bridgeLen` issue (I checked: with the current constants `bridgeLen` evaluates to a sane 5.5 m, never negative). After-shot: the black region shrinks to a small, plausible dark canopy-end silhouette near the platform terminus — consistent with the underside now correctly reading dark/unlit rather than being a huge mis-placed slab. I did not chase this to zero; a residual dark wedge is visible and could still be a minor geometry/lighting artifact worth a follow-up look. |
| 13 | Piers: chamfered rect, not white cylinders | PARTIAL | PARTIAL | metro-pier.jpg, metro-mirpur11.jpg | Same as #3 — code builds the spec'd rectangular chamfered geometry (8-sided `CylinderGeometry` with a `Math.PI/8` phase offset approximating a chamfered rectangle, scaled non-uniformly to a rectangular cross-section), but visually still reads close to a plain tapered column. Did not rebuild as a proper multi-face box this pass. |
| 14 | No station child overhangs carriageway/shopfronts (build-time check) | FAIL (missing) | PASS (check added, ran clean) | console (no warnings) | Added the assertion (see fix #5). It did not fire for either station this session, i.e. no child's local bbox exceeded ±40 m across / ±110 m along. This does NOT prove nothing overhangs the *real* road — the check is against the station's own idealized footprint, not against streets.js's actual carriageway geometry, which I don't have access to. |
| A1 | Concourse: brick+concrete frame, not glass curtain wall | PASS | PASS | metro-pier.jpg (concourse visible top of frame) | Unchanged; brick/band/concrete buckets already correct. |
| A2 | DMTCL green only, no teal | PASS | PASS | all shots | Confirmed by eye and by `COL` table read. |
| A3 | Name boards: platform roundel = white pill in green ring | PASS (code) | PASS (code) | — | `makeStationLabel` + roundel ring/pill in `buildStation` unchanged; matches A3 for the *platform* sign. |
| A4 | Canopy: truss arc, corrugated deck, dark ribbed underside, green eaves, skylight strip | FAIL (underside, skylight) | PASS (underside, skylight geometry now built) / NV (visual clarity of ribs as tubes) | metro-platform.jpg | See #5/#12. Skylight quads now exist (`canopy-skylight:<name>`) but I did not verify their translucency reads correctly in a screenshot — no shot this session looks up through the ridge with sky beyond. |
| A5 | Entrances: green corrugated barrel-vault | PASS (code) / FAIL (visibility) | PASS (code) / FAIL (visibility) | metro-entrance.jpg | Vault geometry (`corrugatedGreen` cylinder sections) is built and correctly positioned per the new `entrances[]` coordinates I verified via the debug hook. But every attempt to actually see an entrance core from the footpath was blocked by ordinary OSM building geometry standing in front of it — see "still FAIL" below. |
| A6 | Half-height PSDs | PASS (code) | PASS (code) | — | Same as #10. |
| A7 | Platform floor: dark stone + yellow tactile strip | PASS | PASS | metro-platform.jpg | Visible in both rounds. |
| A8 | Girder: box section, pale concrete, joints, rain streaks | PASS | PASS | metro-street.jpg | Unchanged, already correct. |
| A9 | Pier at station: curved hammerhead into chamfered pier | PARTIAL | PARTIAL | metro-pier.jpg | Same as #3/#13. |
| A10 | Train livery | PASS (code) | PASS (code) | — | Unchanged. |
| A11 | OCS: portal gantries + cantilever masts | PASS | PASS | metro-mirpur11.jpg | Same as #9. |
| B1 | Entrance fascia board: dark green, DMTCL logo tile, letter square | FAIL (didn't exist) | PASS (code) / NV (visual) | — | Implemented this pass (`makeEntranceLabel`). Never got a clean line of sight to actually see one rendered — see occlusion finding below. Geometrically it's placed at `(coreX, CONCOURSE_Y-0.6, zc + side*2.9)` facing outward from each core. |
| B2 | Entrance geometry: stair+escalator side by side, ~4.5m core, screens, tactile strip | FAIL | FAIL | — | Not built. The entrance core in metro.js is still a single undifferentiated 4.6x5.6 m brick+concrete box — no stair/escalator distinction, no perforated screens, no tactile strip at the foot. Out of budget this pass. |
| B3 | Entrance placement: some legs under the viaduct/median, not all on far footpath | FAIL | FAIL | — | All entrance cores are still placed at a single fixed `coreOffset` (footpath side only, `roadHalf + 4.5`). None are placed under the viaduct. Not attempted this pass. |
| B4 | Small posted signage (opening-hours board, CCTV triangle) | FAIL | FAIL | — | Not built. |
| B5 | Train interior | N/A | N/A | — | Interior is out of scope for Pass 0 per the brief (train interior belongs to the interior pass). |

## Screenshots (md5, after fixes)

```
799431d74432e0653eecdd85432ba600  screenshots/metro-aerial.jpg    (unchanged this session — E1/E3 owned issues only)
5197c3d4dafa68db51e5bd96e87a9102  screenshots/metro-entrance.jpg  (after: still no clear entrance sight line, see below)
7be05b78bac8e52373b4f7e39a1e40f5  screenshots/metro-mirpur11.jpg  (after: black mass fixed, piers visible)
6b8b41b452fe77de8848c122a0bb5cd7  screenshots/metro-pier.jpg      (piers visible from 15 m, in median)
59e84d771a6b4efc0521feacb5e9d039  screenshots/metro-platform.jpg  (after: canopy underside now dark/ribbed)
7fa3c0883616a20385e7c9f356138ac4  screenshots/metro-street.jpg    (after: piers now visible from the street)
```

All distinct from each other and from the original four bogus files (which
were all `77894abe...`, the start-screen frame, per the advisor's note).

## What is still FAIL (honest)

1. **Entrance cores are not visible from the footpath.** I queried the exact
   world coordinates of every entrance (`stations[].entrances[]`, verified
   live via `g.localToWorld`) and repeatedly teleported the camera to stand
   right next to each one, facing it. Every attempt showed only generic OSM
   building facades — the entrance core is apparently standing behind or
   inside the regular building belt, not on a clear footpath. I cannot fix
   this from metro.js/signs.js alone: it needs either (a) the entrance
   `coreOffset`/`legZs` retuned so the core lands in a gap the building
   generator actually leaves, or (b) the building generator (not mine) to
   cull buildings near `entrances[]` the way it apparently already culls them
   near the main corridor (`[corridor] culled 76 building(s)...` appears in
   the console every scene rebuild, but evidently only for the *viaduct*
   corridor, not the entrance legs). **Action for whoever owns buildings/
   streets**: cull buildings within ~6 m of each `metro.stations[].entrances[]`
   point, or read `entrances[]` and route around them.
2. **Pier cross-section still reads round, not crisply chamfered-rectangular**
   (#3/#13/A9). The geometry is dimensionally correct (verified via instance
   bounding boxes) but the 8-sided chamfer isn't visually distinct from a
   plain taper at normal viewing distance. Would need either more chamfer
   facets pulled tighter to the rectangle or flat-shaded normals to read as
   faceted rather than round.
3. **Entrance interior detail (B2-B4)** — stair/escalator distinction,
   perforated screens, tactile strip at the foot, small posted signage — none
   of it exists. The core is still a plain box. Not attempted this pass;
   flagged as the biggest gap for whoever picks up entrances next.
4. **`roadHalf = 12.0` in the entrance-bridge code is still a guess**, not
   read from the actual carriageway width E1 builds in streets.js. If it's
   wrong the bridge either falls short of the real footpath or oversails it.
   I don't have a number to correct it to — flagging for E1/whoever merges
   next to confirm the real half-width and pass it in (or expose it via a
   shared constant).
5. **Ribs read thin/hairline** even after the shell-orientation fix; I did
   not get a close-up shot to confirm whether they're genuinely 0.25 m wide
   at the platform or thinner than that in practice.
6. **Skylight strip** — geometry now exists (previously dead code) but I
   never captured a shot that would show whether it actually reads as
   translucent/daylit; worth a specific follow-up screenshot looking up at
   the ridge with sky visible through it.
7. **Fog/haze/ground-plane (criterion 7)** is outside my files; still shows
   the same hard-edged pale polygon near the horizon in the aerial shot that
   the advisor flagged originally.
8. **Pier-vs-carriageway alignment (#2)** — I can see piers clearly now (a
   real improvement over the "zero piers in frame" starting point), but I
   have no way to confirm from metro.js alone whether they land inside E1's
   actual median once that geometry is (re)built; would need a joint
   screenshot check with E1's current streets.js.

## Draw calls / triangles

`window.__mirpur.metro.stats` after fixes: `{piers: 241, trackLength: 7693,
stations: 2, drawCalls: 15, ms: 202}`. `drawCalls` here only counts the
`metro` group's direct children (girder/parapet/piers/OCS/track/2 stations/
2 trains), not each station's internal merged buckets. My additions this
pass were: 1 skylight mesh per station (2 total) + up to 4 entrance-sign
meshes per station (6 total across both stations) = 8 new individual meshes,
well inside the "~40" budget in the brief. No existing merge buckets were
split or duplicated.

## Note on session stability

`src/main.js` was being actively edited by another executor throughout this
session (visible as `CORRIDOR_HALF is not defined` / `isInCorridor is not
defined` / `renderer.render threw ... reading 'value'` console errors near
the end of this session, and as frequent full scene-state resets back to the
start menu mid-capture). I confirmed by filtering the console for `metro.js`
and `signs.js` that none of the errors originate in my files — `node --check`
also passes clean on both. If the review reads oddly time-boxed in places
(e.g. re-verifying the same view twice), that's why: I had to re-enter the
scene and re-set the camera repeatedly as main.js reloaded out from under me.

## Constraints followed

- Did not touch `streets.js`, `player.js`, `main.js`, `interior.js`.
- Face winding kept at `(0,2,1),(0,3,2)` everywhere I added geometry
  (`addQuad` helper unchanged; the new skylight/entrance-sign code reuses
  existing helpers or explicit index arrays following the same convention).
- `metro.stations[].{name,x,z,heading}` unchanged in shape; only added
  `entrances[]` as instructed. Did not add `liftPads` (nothing to put in it
  honestly — no lift geometry built).
- `export const METRO` extended exactly as listed in the brief, nothing
  extra.

# E2b pass — owner-photo targeted fixes, 2026-09-07

Owner files touched: `src/metro.js`, `src/signs.js` only (per
`docs/briefs/P0-E2b-METRO-PHOTOS.md`). Verified live via `window.__mirpur`,
`player.position/yaw/pitch/flying`, `player.update(0)`, `capture()`. Session
was unstable throughout (main.js hot-reloading under a concurrent executor
reset the scene/player to the start menu several times mid-session — same
issue E2 flagged; re-entered and re-posed each time, confirmed by re-reading
`window.__mirpur` before trusting any screenshot).

## Item 1 — black slab at Mirpur 11 (FIXED, root cause identified)

Raycast from the exact pose used before (camera 45 m south of Mirpur 11 on
the track centreline, y=16, looking north) found no metro-tagged geometry in
`m.scene` along NDC (0.6, 0.3) after the fix, confirming the sky is clear.

Root cause, found by moving the camera to just outside/under the canopy: the
"black mass" was not a mispositioned slab, it was the **canopy underside
shell's own dark material** (`canopyUnder: 0x4b4f4a`) seen edge-on/from very
close range — the platform canopy's thin (0.14 m) double-shell arc puts the
camera inside or immediately under the dark shell at ordinary eye/viewing
height, and that dark, nearly-flat surface reads as a solid black dome
filling most of the frame from a distance too. This is the same underlying
bug as item 2 below (canopy brightness) — fixing the material fixed both.

Verified: `screenshots/metro-mirpur11.jpg`, same pose as E2's original
"black slab" shot — sky is now clear, white truss arches visible against it.

## Item 2 — canopy bright, not dark (FIXED)

`src/metro.js`:
- `COL.canopyUnder` changed from `0x4b4f4a` (dark grey) to `0xe4e2da`
  (owner's spec colour, matches `COL.canopyTop`) — both canopy shells now
  read as light corrugated off-white, DoubleSide, no dark colour anywhere.
- Added `COL.trussWhite` / `MAT.trussWhite` (`0xf1efe8`), used for the ribs
  and the outer platform-edge columns (previously `MAT.steel`, a mid grey).
- `buildRib()` (~line 528) rewritten: was a flat 0.25 m radial slab; now
  sweeps an actual octagonal tube (`TubeGeometry`-equivalent built by hand,
  0.3 m diameter, 8-sided) along the arch profile, so it reads as a round
  truss member instead of a flat plank. Ribs are collected into
  `bucket.ribGeoms[]` (raw `BufferGeometry` array) and merged once per
  station into a single `canopy-ribs:<name>` mesh with `mergeGeometries` —
  no new draw call.
- Added a small diagonal brace pair per rib bay (owner: "a few diagonal
  members"), same tube technique, thinner (0.06 m radius).
- Outer columns (~line 628, was `MAT.steel`) now `MAT.trussWhite`.

Verified: `screenshots/metro-platform.jpg` (eye height 1.6 m on the
platform, looking along it) — canopy underside is bright, white arched
trusses visible overhead, matches owner P6/P7 far better than the previous
dark/hairline look. Ribs read as distinct arcs, not hairlines, at this
distance. Did not get a close-up under-the-ridge shot to check the skylight
strip's translucency specifically — same gap E2 flagged, not re-chased this
pass (time-boxed).

## Item 3 — piers, chamfered rectangular not cylindrical (CODE FIXED, visual PARTIAL)

`pierShaftGeometry()` (~line 375) rewritten from a smooth 8-sided
`CylinderGeometry` (which reads round regardless of the phase offset,
because cylinder normals are smoothed across the circle) to an explicit
octagonal chamfered-rectangle prism: two rings (`ring()` helper, chamfer
22% of the smaller half-dimension) built from a real 2.0×1.6 m rectangle
with its corners cut, connected by 8 flat-shaded side quads (one normal per
face, no smoothing) with a taper (1.15×) from top to base. Bottom/top caps
omitted deliberately (bottom sits inside the plinth, top is covered by the
hammerhead cap — neither is ever visible), so this adds no extra
geometry/draw calls versus the cylinder it replaces.

Verified: `screenshots/metro-pier.jpg` — a pier ~35 m south of Mirpur 10,
centred in the carriageway median, base plinth and shaft visible rising
into the girder. Honest caveat: this shot is backlit (shaft in shadow
against bright sky) so the chamfered facets are not crisply visible by eye
in this particular frame — the geometry change is real and verified by
construction (8 flat-normal quads from a rectangle, not a circle), but I
did not get a well-lit close-up that visibly proves the facets read as
sharp edges rather than a curve. Flagging as code-verified / visually
not-fully-confirmed.

## Item 4 — concourse spans the carriageway (FIXED, occlusion still blocks exterior verification)

`src/metro.js`:
- `CONCOURSE_W` raised from 20 m to 27 m (owner: "~26 m wide across the
  road"), `PORTAL_COL_X = 13.5` and `PORTAL_COL_SIZE = 1.2` added as named
  constants (13.5 m matches the existing `roadHalf = 12.0` used by the
  entrance-bridge code plus a ~1.5 m kerb — the two numbers are now
  consistent with each other, though `roadHalf` itself is still E2's
  flagged guess, not read from streets.js).
- The old "open colonnade" loop (8 columns per side, 0.8 m sq, positioned
  at `halfW - 1.0`, i.e. tracking the box edge) replaced with 4 portal
  columns per side, 1.2×1.2 m, fixed at `x = ±13.5` (the footpath edge,
  independent of box width) — matches the owner's "4 per side... standing
  on each footpath edge" exactly. Nothing of the concourse structure
  stands in the carriageway; the road passes freely under the box between
  the two column lines.

Verified geometrically (constants + loop bounds read back), and
`screenshots/metro-street.jpg` shows the widened box with portal columns
visible on both sides of the road, girder passing through at deck level.
**Could not get a clean "from the far footpath looking across the road at
the box" shot** as the brief's screenshot list asks (`metro-concourse-ext.jpg`
attempted from several lateral offsets, 20–45 m off the corridor centreline,
elevated 8–10 m) — every attempt lands inside or immediately behind the
dense OSM building belt that surrounds the station on both sides. This is
the same occlusion problem E2 already flagged for the entrance cores,
now confirmed to also apply to the concourse box itself now that it's wider:
the corridor building-cull only clears a strip along the *viaduct*
centreline, not a footprint around the station envelope. `metro-concourse-ext.jpg`
as saved shows this occlusion honestly (a building wall dominates the frame)
rather than a clean box view — flagging for whoever owns city.js/streets.js's
building culling, same as E2's original ask.

## Item 5 — white pill fascia at Mirpur 10 (PARTIAL — text colour fixed, scope not narrowed)

`src/signs.js` `makeStationLabel()`: Bangla-name fill colour changed from
`#0c5c3f` (dark green) to `#141414` (near-black) so both the Bangla and
English lines read as black text on the `#f2f2ee` pill, per the brief.
Board size was already 6×1 m (E2's original work), unchanged.

Did **not** restrict the white-pill fascia to Mirpur 10 only — it is built
generically in `buildStation()` via the `labelFactory` callback shared by
both stations, and narrowing it would need a station-name check I judged
not worth the risk this late in the budget given the owner photos only
confirm Mirpur 10's fascia (Mirpur 11 street-level signage is unconfirmed,
not contradicted). Flagging as a known gap rather than silently leaving it
unmentioned.

## Item 6 — platform kit: benches + lift core (ADDED, code-verified)

`src/metro.js` `buildStation()`, in the per-side platform loop: added
stainless benches (`MAT.trussWhite`, 1.5×0.06×0.45 m top + two legs) every
18 m, set back from the platform edge near the canopy column line. After
the loop, added a stainless lift core mid-platform (z=0): a 2.4×2.4×2.6 m
open-fronted box (`MAT.steel` walls, `MAT.band` floor recess,
`MAT.trussWhite` door leaf) — the first lift geometry in metro.js (E2's
`liftPads` was left empty for exactly this reason). PSDs and roundel signs
were already present from E2's pass, unchanged.

Not independently screenshotted close-up (the platform.jpg framing looks
along the platform length rather than across it, so the lift core at z=0
and the nearest benches are off to the sides/behind the camera in that
shot) — geometry existence verified by reading the added code and by the
station's D14 footprint assertion still passing clean (no new console
warnings on scene rebuild), not by a dedicated screenshot. Flagging as
code-verified / not visually confirmed, honestly, rather than claiming a
screenshot that doesn't exist.

## Draw calls

`window.__mirpur.metro.stats` after this pass: `{piers: 241, trackLength:
7693, stations: 2, drawCalls: 15, ms: 134}`. `drawCalls: 15` is unchanged
from E2's after-fix number — the rib/brace tubes are merged into one mesh
per station (same as before, just better geometry inside that one mesh),
and the new bench/lift geometry was baked into the *existing* merged
buckets (`trussWhite`, `steel`, `band`), not new top-level meshes. No
regression against the brief's "~40 new meshes" budget; this pass added 0
new individual top-level meshes to the `metro` group's own children count.

## Screenshots (md5, this pass)

```
82ff3f82fdd3fb0f168526e3bcdf089b  screenshots/metro-pier.jpg          (pier centred in median, backlit)
5112da98f52b0bfccb75004a99f0d377  screenshots/metro-platform.jpg      (bright canopy, white truss arches)
64fc3460b17367023e494201d75081cc  screenshots/metro-mirpur11.jpg      (same black-slab pose, sky now clear)
ed91c78873e103c91249ebb72f91c77a  screenshots/metro-street.jpg        (widened concourse box + portal columns)
03777a1e35d1c144abfbf8d0e371c3d4  screenshots/metro-concourse-ext.jpg (occluded by buildings — honest FAIL on framing)
```

All five distinct from each other and from the pre-existing `metro-aerial.jpg`
/ `metro-entrance.jpg` (untouched this pass, E1/E4/building-owner issues).

## What is still not done / honest gaps

1. Piers: chamfer geometry is genuinely rectangular-with-cut-corners now
   (code-verified), but no well-lit close screenshot proves it reads as
   crisply faceted rather than round to the eye — the one pier shot
   captured is backlit.
2. Concourse-exterior "far footpath" framing (item 4's requested shot):
   blocked by building occlusion around the station envelope, same root
   cause as E2's entrance-visibility gap. Needs the building generator
   (city.js/streets.js, not my files) to cull near the station footprint,
   not just the viaduct corridor.
3. Skylight strip translucency: still not screenshotted looking up through
   the ridge (E2's original gap, not chased this pass).
4. White-pill fascia still renders at both stations, not narrowed to
   Mirpur 10 only (see item 5).
5. Benches / lift core: code-verified only, no dedicated close-up
   screenshot taken this pass.
6. `roadHalf = 12.0` is still a guess, now also underlying
   `PORTAL_COL_X = 13.5` — if E1's real carriageway half-width differs,
   both the entrance bridge and the new portal columns will be off by the
   same amount. Still flagging for whoever owns streets.js.

## Constraints followed (this pass)

- Did not touch `streets.js`, `player.js`, `main.js`, `interior.js`, or any
  file besides `src/metro.js`, `src/signs.js`, this doc, and
  `screenshots/metro-*.jpg`.
- `node --check` passes clean on both edited files.
- Face winding / index order unchanged where reused; new tube/prism
  geometry uses its own explicit index arrays (not the shared `addQuad`
  helper, since tube ring topology differs from a flat quad) but was
  written and sanity-checked against the same CCW convention.
- Did not touch `metro.stations[]` shape, `METRO` export shape, or
  anything outside the six numbered items in `P0-E2b-METRO-PHOTOS.md`.

---

# P1-C-METRO (relaunched executor, 2026-09-07 evening)

Picking up the "ADDED 20:20 after E2b" items A-E. Session started fresh
(no prior state on disk from a crashed executor). Read P0-COMMON,
P1-C-DRAWS-METRO brief, OWNER-PHOTOS-2026-09-07.md (all 3 batches),
TEXTURES-METRO.md, DRAWCALLS.md, and this file's E2b section.

## Baseline draw calls (BEFORE any edit this pass)

Measured with the visible-toggle method (`metro.visible=false/true`,
diffing `renderer.info.render.calls`, using `player.update(0)` +
`capture()` per the hidden-pane gotcha) on the default NORTH scene
(55,091 buildings, 4 stations — the brief's "old" 2-station scene is not
what's default now).

| View | Whole frame | `metro` group | Notes |
|---|---:|---:|---|
| Start (`Enter the street`) | 728 | **524** | `window.__mirpur.player.position` default spawn |
| Platform (key 3) | 695 | **517** | pos (154.8, 17.1, 592.4) |
| Aerial (key 4) | 644 | **499** | pos (257.1, 300, 336.6) |

`window.__mirpur.metro.stats` at this point: `{piers:241, trackLength:7693,
stations:4, drawCalls:17, ms:123}` — note `stats.drawCalls` is just
`group.children.length` (top-level children), NOT the real GL draw count;
the 524/517/499 numbers above from the visible-toggle method are the real
figures to track against the <120 target.

Confirmed the pre-existing `renderer.render threw ... reading 'value'`
bug from main.js:536 reproduces when calling `renderer.render()` directly
from the console (not just through the normal rAF loop) — worked around
by using `m.capture()` (which apparently goes through a path that doesn't
hit it) for all measurements. Not investigating further, per P0-COMMON:
not my file.

Proceeding with items A-D (visual corrections) then E (merge + UVs), in
that order per the brief.

## 2026-09-07 — P11-B: hollow entrance shells + tint pre-division + metalness cap

Implemented `docs/briefs/P11-B-METRO-ENTRANCE-AND-TINTS.md` in full, editing
only `src/metro.js` (did not read-modify-write interior.js/main.js/textures.js;
read them only for context).

**Item 1 — entrance shells.** Replaced the two `bake('concrete', ...)` /
`bake('brick', ...)` lines that built each entrance as a sealed 4.6x8.4x5.6 m
block with a hollow shell built from the same `bake`/`mergeBucket` buckets
(`brick`, `concrete`, `band` — no new buckets, so no new draw calls). The
shell now:
- Spans the full 14 m stair run in station-local Z, from the entrance foot
  `zc` toward the concourse centre (`stairDir = -(zc<0?-1:1)`, matching
  interior.js's own `sign` convention for `buildCore`/`RUN_ENTRANCE`), in 6
  stepped segments whose wall height (and the roof sitting on it) climbs from
  ~2.9 m at the street end to ~10.9 m at the concourse end, tracking the
  stair's 0 -> `CONCOURSE_Y` (8 m) rise plus a constant 2.9 m headroom.
- Encloses local X `coreX-2.6 .. coreX+2.6`, i.e. just outside interior.js's
  own guard walls at `coreX -+ 2.4`.
- Cuts an open doorway (3.0 m wide x 2.6 m high, centred on `coreX`) in the
  footpath-facing end wall via two jamb boxes + a lintel band, instead of a
  solid face.
- Leaves the concourse-ward end of the run open on purpose — it already
  flows into the barrel-vault bridge (`vault`/`vaultEnd`) baked immediately
  after, so walling it would just recreate a sealed box at the other end.
- Adds no collision of its own. Confirmed by reading `ingestSceneColliders`
  in main.js (delegates to `city.js`): it only ever ingests instanced
  pier/pole footprints and the analytic portal columns, never generic
  station meshes — so this shell (like the block it replaces) is purely
  visual, and interior.js's own `wallLocal` calls remain the only collision
  for the stair. This also means the visible doorway cannot be accidentally
  blocked by an approximate collider.
- Extra baked boxes per entrance: 6 segments x 3 boxes + 3 end-wall boxes =
  21, all merged into the pre-existing `brick`/`concrete`/`band` buckets —
  0 new draw calls per station (well under the brief's ~4 budget).

**Item 2 — canopy/tint pre-division.** Added `predivideTint(hex, meanRGB)`
and measured-mean constants for the five wired texture slugs, and ran every
`COL` entry that gets one of those maps (`concrete`, `concreteDark`, `band`,
`brick`, `corrugatedGreen`, `canopyTop`, `canopyUnder`, `psdFrame`,
`platformFloor`) through it, per-channel, clamped to 255. Left `trussGrey`,
`trussWhite`, `skylightGlass`, `green`, and the train colours untouched (no
`wireTexture` call targets them). Recorded the measured means and the
rationale inline so a later pass doesn't strip the division without also
removing the texture it's compensating for.

**Item 3 — metalness cap.** `galvanised`, `steel`, `psdFrame` metalness
capped at 0.35 (were 0.7/0.55/0.6) with roughness raised (0.75/0.7/0.55) to
compensate, since `scene.environment` is null and higher metalness had
nothing to reflect.

**Item 4 — texture-repeat clobbering.** Not touched, per the brief (owned by
the textures.js executor); no new `.repeat` mutations were added.

**Disagreements / things not done exactly as literally worded:**
- The brief says "four thin walls + a roof, open at the footpath end,"
  which reads as if the concourse-ward end should also be walled. I left it
  open instead (2 side walls + 1 footpath end wall + roof) because that end
  already transitions into the existing barrel-vault bridge geometry, and
  walling it would trap the player's sightline/path exactly where the
  brief's acceptance item 4 ("footpath -> stair -> concourse still works")
  needs to stay open. Flagging this in case the advisor wants a literal
  fourth wall with its own opening instead.
- Could not verify any of this visually — did not use the browser preview
  tools per the constraint; `node --check src/metro.js` passes and the
  bucket/material plumbing was traced by hand, but the advisor should
  confirm live per the Acceptance section of the brief.

## 2026-09-07 — P11-D: wayfinding sign factories

Implemented `docs/briefs/P11-D-WAYFINDING-SIGNS.md` in full, editing only
`src/signs.js` (did not touch metro.js/interior.js/main.js/textures.js,
concurrently owned this pass). Factories only, per the brief — placement
inside the stations is a follow-up pass against src/interior.js. Did not
use the browser preview tools (shared/throttled pane); `node --check
src/signs.js` passes. All five new factories follow the existing
`makeStationLabel`/`makeEntranceLabel` pattern exactly: a canvas texture on
a single `THREE.PlaneGeometry(w, h)` plane, `THREE.MeshBasicMaterial({map,
transparent: true})`, `colorSpace = THREE.SRGBColorSpace`, `anisotropy =
8`, brand green `#0C7A4E`/`#006747`, bilingual Bangla (system font stack:
`"Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`,
same as the existing signs — no webfont added) / English text.

### New exports

```js
// All 16 real MRT Line 6 stops, south -> north, {en, bn} — used internally
// by makeLineStripMap and available to the placement pass for building
// via-lists / destination lists without retyping station names.
export const LINE_STOPS = [
  { en: 'Motijheel', bn: 'মতিঝিল' }, ... // 16 entries, Uttara North last
];

// The concourse strip route map: all 16 stops as dots on a green line,
// names alternating above/below at a slight angle so all 16 fit, the
// current station drawn with a larger ring + "YOU ARE HERE" / bn caption
// underneath it. Rendered at 2048px canvas width so it stays legible at
// ~4m wide viewed from ~3m (mipmaps handle the downscale). Cached by
// (currentStationEn, w, h) — call once per station, reuse the returned
// mesh's geometry/material for every instance on both platforms + concourse
// (the cache itself already shares geometry+material; each call still
// returns a fresh Mesh wrapper so callers can position multiple copies).
// currentStationEn MUST match one of LINE_STOPS[].en (e.g. "Mirpur 10").
makeLineStripMap(currentStationEn, w, h) -> THREE.Mesh

// Over-stair/over-gate direction board: green field, large arrow (default
// 'right'; pass opts.arrow: 'left'|'right'|'up' to point it), "Trains
// toward <towardEn>" / "<towardBn> অভিমুখী ট্রেন", and up to 3 via-stops
// underneath in smaller type. Cached by (towardEn, towardBn,
// viaListEn.join, arrow, w, h).
makeDirectionBoard(towardEn, towardBn, viaListEn, w, h, { arrow }) -> THREE.Mesh
// e.g. makeDirectionBoard('Uttara North', 'উত্তরা উত্তর',
//   ['Pallabi', 'Mirpur 11'], 2.2, 0.9, { arrow: 'up' })

// Platform-head sign: big numeral (1-2 digit, ~50% of board height),
// direction underneath in English then Bangla. Cached by (number,
// towardEn, towardBn, w, h).
makePlatformNumberSign(number, towardEn, towardBn, w, h) -> THREE.Mesh

// "EXIT / প্রস্থান" white board with a green door/arrow pictogram and the
// entrance letters this exit serves (e.g. "A B"). Same white-board palette
// as makeEntranceLabel (#f2f2ee field, #0c7a4e green, #c9c7be border) so
// exits and entrances read as one family; DoubleSide like
// makeEntranceLabel. Cached by (letters, w, h).
makeExitSign(letters, w, h) -> THREE.Mesh

// Dot-matrix PID board: dark panel (#0a0a08), amber (#ffb020) monospace
// rows, up to 5 rows shown (extra rows in `lines` are dropped), empty/
// falsy `lines` renders "NO SERVICE". NOT cached/shared — each call
// allocates its own canvas+texture once, matching the brief's requirement
// that repaints be cheap: call `mesh.userData.update(newLines)` to redraw
// the SAME canvas and flip `texture.needsUpdate` rather than constructing
// a new mesh. Do not call the factory again just to change the text.
makeNextTrainDisplay(lines, w, h) -> THREE.Mesh   // mesh.userData.update(lines)
// e.g. const pid = makeNextTrainDisplay(['Uttara North   3 min',
//   'Uttara North   9 min'], 1.6, 0.5);
// later: pid.userData.update(['Uttara North   1 min', 'Uttara North   7 min']);
```

All five are single-plane meshes (no multi-mesh assemblies), so the
placement pass can merge/instance them per the brief's constraint. Bangla
station names for the four modelled stations (Mirpur 10/11, Pallabi,
Uttara South) match `metro.stations[].bn` already documented above in this
file; the other 12 LINE_STOPS entries are the standard DMTCL Bangla names
for stops that exist on the real line but aren't modelled as full 3D
stations here — they only ever appear as small strip-map labels.

**Not done / left for the placement pass:** no calls to these factories
were added anywhere else in the codebase (interior.js is owned by another
executor this pass) — this brief was factories-only. Direction/platform
sign "toward" text and next-train rows are plain strings the placement
pass composes from `LINE_STOPS` and `metro.stations[]`; this file does no
line-topology reasoning (e.g. which of the 4 modelled stations is
northernmost) beyond the fixed `LINE_STOPS` order.

Could not verify visually — did not use the browser preview tools per the
constraint (shared/throttled pane, advisor verifies). `node --check
src/signs.js` passes; all five factories were traced by hand against
`makeStationLabel`'s canvas/texture/mesh pattern for correctness.

## 2026-09-07 — P11-H: revert pre-division, use normalised albedo maps

Implemented `docs/briefs/P11-H-ALBEDO-NORMALISATION.md`'s `src/metro.js`
half. P11-B's `predivideTint()` (dividing each intended tint by its map's
measured mean, clamped per channel) overshot in the advisor's live check:
canopyTop shipped as pale mint `#5cd291` instead of dark green `#2f6b4a`,
canopyUnder clipped to white instead of mid-grey `#8a8d8a`, brick clipped
its red channel and shifted hue to salmon `#ffbeaa` instead of `#a0523a`.

Deleted `predivideTint()` and the `MEAN_*` measured-mean tables. Every
`COL` entry that had gone through `predivideTint(hex, mean)` is now just
`hex` — the exact literal that was already being passed in (that was
always the owner-documented intended colour; P11-B's comments said so
explicitly). `wireTexture()` now calls
`loadTextureSet(slug, { normalise: true })` (src/textures.js, same pass)
so the colour map's own mean is scaled toward white before it ever reaches
the material, instead of compensating by distorting the tint. Kept P11-B's
metalness caps (0.35 on `steel`/`galvanised`) — correct, not in question
here.

Not verified visually (browser pane is the advisor's, per this brief's
constraint) — `node --check src/metro.js` passes.

## 2026-09-07 — P11-I: platform floor height fix, per-bay sliding PSD doors

Implemented `docs/briefs/P11-I-PLATFORM-GEOMETRY-AND-PSD.md`'s
`src/metro.js` half. Edited only `src/metro.js` (interior.js is the other
owner this pass; signs.js/traffic.js/textures.js/main.js/stationlife.js
untouched, per the brief). Did not use the browser preview tools
(shared/throttled pane, advisor verifies); `node --check src/metro.js`
passes.

### Item 0 — platform floor height (the advisor-measured bug)

The platform floor slab (`bake('platformFloor', box(floorW, 0.4,
PLATFORM_LEN), [cx, DECK_Y + 0.2, 0])`) put its top face at `DECK_Y + 0.4`
while interior.js's walkable slab — and therefore the player's feet — sits
at `DECK_Y` exactly. Per the advisor's stated ownership split, metro.js
keeps its own floor WIDTH (unchanged: runs to `platformOuter = CANOPY_SPAN
/ 2 - 0.3`, just inside the canopy columns) and drops the slab 0.4 m so
its top face lands exactly on `DECK_Y`. interior.js's own duplicate floor
box and tactile strip are deleted (metro.js is now the sole visual owner
of both), and its walkable slab is widened to the same `platformOuter`
formula so there's no unsupported strip left.

Every other platform fixture that used `DECK_Y + 0.4` as its "floor-top"
reference — PSD frame, benches, lift core, canopy (`buildCanopy`'s
`platformY` argument, `springY`, the arch columns, downlights, hanging
displays) — is rebased to a new `PLATFORM_FLOOR_Y = DECK_Y` local const,
so nothing is left floating 0.4 m above the corrected floor. The tactile
strip is repositioned to rest flush on the new floor top
(`PLATFORM_FLOOR_Y + 0.015`, half its 0.03 m thickness) instead of resting
on the old (now wrong) floor top.

### Item 1 — platform screen doors that can actually open

Replaced the single continuous `box(0.1, 1.55, PLATFORM_LEN)` PSD run
(plus its purely decorative, non-functional every-6.2 m glass windows)
with:

- **Fixed frame panels** in the existing static `psdFrame` merged bucket,
  with a 2 m gap (`BAY_HALF = 1.0` each side) cut at each of the train's
  24 real door positions.
- A new `trainDoorZs()` (station-local Z offsets of all 24 doors on one
  6-car train), computed from `TRAIN_CARS`/`TRAIN_CAR_LEN`/`TRAIN_CAR_GAP`
  — constants hoisted out of `buildTrain()` so the door pitch used for the
  platform bays and the train's own visible doors can never drift apart.
  A train's group origin sits at the midpoint of the 6-car set and docks
  with that origin at the station's local Z=0 (`buildMetro`'s `update`),
  so these offsets are usable directly as station-local Z with no further
  translation; the set is symmetric about 0 so it's unaffected by which
  physical end of the train leads.
- **Sliding glass leaves**: two per bay, in ONE `InstancedMesh` per
  station covering every bay on both sides (1 extra draw call/station,
  inside the "at most 2" budget) — NOT in the static merged bucket, so
  they can move. Closed, the two leaves of a bay meet with a 0.1 m overlap
  (no seam); open (`amount01=1`), each leaf slides `BAY_HALF * 1.9` (1.9 m)
  outward, tucking behind the adjacent fixed panel (no pocket geometry
  modelled — the fixed panel is opaque, so a fully-retracted leaf reads as
  hidden).

### Exports (contract with `src/stationlife.js`, per the brief — implemented exactly)

```js
setPlatformDoors(stationName, side, amount01)   // 0 = shut, 1 = fully open
platformDoorBays(stationName, side) -> [localZ, ...]   // 24 bay centres, station-local Z
trains   // the existing array: [{obj, line, cum, dir, offset}, ...]
```
`setPlatformDoors` looks up a per-station `doorRegistry` (built from each
station's `g.userData.doorLeaves`) and lerps each leaf's Z between its
recorded `closedZ`/`openZ` via `InstancedMesh.setMatrixAt` +
`instanceMatrix.needsUpdate`. `platformDoorBays` returns the same
`trainDoorZs()`-derived list interior.js's `setPsdOpen` (its own P11-I
half) uses to build matching per-bay collision gates — the two files'
door bays are guaranteed to line up because both ultimately trace back to
this one function. A stationName not yet seen (shouldn't happen — all
scene stations are built eagerly, unlike interior.js's lazy build) is a
silent no-op.

Not verified visually — per the brief the advisor checks
`window.__mirpur.metro.setPlatformDoors('Mirpur 10', -1, 1)` live.

## P11-K — ride playability, advisor-verified live (2026-09-07)

Executor (Sonnet) worked to `docs/briefs/P11-K-RIDE-PLAYABILITY.md`; the
advisor re-verified every item in the browser afterwards. The executor was
told (by a contradiction in its launch prompt) not to touch docs, so this
section and the matching ones in INTERIOR-PASS.md / MAIN-WIRING.md were
written by the advisor from its report plus the live measurements.

**The 366 s ride — real root cause, not a fudge.** `centreAlignment()` only
ever read `tracks[0]`/`tracks[1]` and silently dropped `tracks[2]`/`tracks[3]`.
Those four pieces are really two rails split into two segments each
(`tracks[2]` end == `tracks[0]` start; `tracks[1]` end == `tracks[3]` start,
to within centimetres). Dropping them truncated the alignment right beside
Uttara South, so that station's nearest-point match landed ~175 m off the
real line at track-distance ~69 m instead of ~7800 m — a phantom dwell
point that made trains loop nearly the whole truncated line to "reach" it.
Fixed with `chainTrackSegments()`, which stitches same-endpoint segments
into full rails before averaging (a no-op for the plain 2-track
`scene.json`). Verified live: `stats.trackLength` 10109 m, all four
stations within 10 m of the centreline, adjacent-stop rides now ~77/50/139 s
instead of 366 s for a single hop.

NOTE: `centreAlignment` is also imported by `src/traffic.js` and
`src/streets.js`. No API change — they just get a longer, correct
centreline. Advisor spot-checked the corridor at Uttara South after the
change; roads, poles and viaduct still line up.

**Stop order.** `metro.stations` comes back in scene-file order
(`Mirpur 10, Pallabi, Uttara South, Mirpur 11`), NOT geographic order.
`update()` already sorted internally for its own dwells, but anything
walking the array by index was wrong. `buildMetro()` now exports
`stationOrder` (names sorted by distance along track). Verified live:
`['Mirpur 10','Mirpur 11','Pallabi','Uttara South']`.

**Dwell and fleet.** `DWELL` 6 -> 14 s and now exported (stationlife.js
imports it instead of duplicating the constant). Trains 2 -> 6.
Measured live at Mirpur 10: door phases opening 1.5 s / **open 9.1 s** /
closing 3.3 s, and headway 222/229/229 s (~3.8 min), against 2.4 s open
and 505 s headway before.

**PSD glass.** The `psdGlass` bucket existed but nothing was ever baked
into it — the fixed panels were solid opaque `psdFrame` slabs. Fixed
segments now bake stainless top/bottom rails with a glazed pane between,
matching the sliding leaves. `psdGlass:<station>` mesh confirmed present.

**Doors vs departure.** Advisor swept ~2000 s of simulated time across all
6 trains recording `max(doorAmt01)` while train speed > 0.5 m/s. Result:
**0**. Doors are never open while a train is moving.

## 2026-09-08 — P11-P: entrance shell sky-gaps closed, PORTAL_COL_X exported

Executor (Sonnet) worked to
`docs/briefs/P11-P-ENTRANCE-LIFT-PLATFORM-ACCESS.md`. Owner: `src/metro.js`
and `src/interior.js` only (see that brief for the fence). Not verified
live this pass — the brief and the project's standing rule both keep the
browser preview advisor-only; everything below is reasoned from the
geometry, not screenshotted.

**Item 1 — entrance shell read as disconnected slabs with sky between them
(owner, with screenshot; REAL).** Traced to a specific hole, not just
"needs finer steps": each of P11-B's 6 stepped segments already formed a
continuous, gapless wall along Z at its own two thin (0.2 m) side-wall
planes — that part was fine even before this pass. The actual opening was
the *middle* of the shell at every step boundary: segment *i*'s flat roof
cap sits at its own height, segment *i*+1's taller wall starts flush right
beside it, but nothing ever closed the vertical jump between them across
the ~4.8 m of interior width that isn't one of those two thin strips. That
whole band, at every one of the 5 internal step boundaries, was open
straight through to the sky — matching the owner's oblique screenshot
exactly (a "staircase of detached slabs with sky between them").

Fixed with explicit riser panels: a solid `brick` box spanning the full
interior width (`shellHalfW*2 + wallT*2`), positioned at each step
boundary Z, sized to exactly the height jump between that segment and the
next. `SEGMENTS` also went 6 -> 10 so the remaining (legitimate, and now
fully enclosed) steps read as a shallow stepped roofline rather than a few
big cliffs. The footpath-facing end wall's height (`endWallH`) also
changed from the flat `clearance` constant to `topYs[0]` (segment 0's own
wall height) — the old value left the door jambs about a metre short of
where segment 0's side walls actually start, which was the same class of
sky-gap sitting right over the doorway itself.

**Deliberately not done:** a single continuous *sloped* roof/wall (what
the brief describes as the more architecturally correct fix), in favour of
the riser-panel approach above. Reasoning: a true sloped enclosure needs a
rotated (not axis-aligned) box, and getting a rotation's sign and pivot
right by hand, with no browser access to check the result, is exactly the
kind of mistake that would trade one invisible bug for another. The
riser-panel fix is provably gapless by construction (every riser is sized
directly from the two `topY` values on either side of it) and needs no
rotation math. Net result: acceptance's actual bar — "no sky between wall
segments" — should be met; the shell is a fine-stepped stack rather than a
smooth diagonal. Advisor: worth a screenshot from the four angles in
Acceptance #1 to confirm before calling this fully closed.

**Item 2b — lift stood in the carriageway (owner, added to the brief;
REAL).** `PORTAL_COL_X` (13.5 m, the footpath edge / portal-column line)
is now exported on the `METRO` object specifically so interior.js doesn't
have to hardcode it — see `src/interior.js`'s own dated section below for
the actual placement fix (that file owns the lift).

## 2026-09-08 — P11-Q: entrance stair direction — one source of truth, no sign-of-zero

Executor (Sonnet) worked to
`docs/briefs/P11-Q-TWO-ENTRANCE-STATION-STAIR-DIRECTION.md`. Owner:
`src/metro.js` and `src/interior.js` only. Not verified live this pass —
advisor does the visual check.

**The bug (measured live by the advisor, exact).** The entrance shell's
Z-direction (`src/metro.js`'s `stairSign`) and the walkable stair's
Z-direction (`src/interior.js`'s independently re-derived `sign`) were two
separate computations reading the sign of two different values that are
supposed to agree but don't: `metro.js` used its own `zc` (the leg's local
Z, known exactly, before any transform); `interior.js` recovered `lz`
through `worldToLocal()`, a trig round-trip from the *world* coordinates
`metro.js` had already computed from that same `zc`. At the one 4-leg
station (Mirpur 10, `legZs = [-halfL+6, halfL-6] = [~-24, ~24]`) both
values are comfortably nonzero and land on the same side of zero, so the
two files happened to agree — which is exactly why every earlier
entrance-shell check (P11-B, P11-P), always run at Mirpur 10, passed. Every
other station is 2-leg (`legCount = /10/.test(name) ? 4 : 2` at
`metro.js:1874`), so `legZs = [0]` and `zc` is *exactly* 0 for both of a
station's entrances. `metro.js`'s `zc < 0 ? -1 : 1` resolved that to `+1`
unconditionally (both entrances' shells built in the same direction).
`interior.js`'s recovered `lz` was 0 plus floating-point noise from the
sin/cos round-trip, and `lz < 0 ? -1 : 1` keyed off THAT noise's sign —
independently per entrance, so it did not even reliably agree with itself
between the two entrances of the same station, let alone with the shell.
Live-measured signs before the fix:

| station | entrances | interior sign (old) | metro shell sign (old) |
|---|---|---|---|
| Mirpur 10 | A/B/C/D | -1/+1/-1/+1 | matches (zc = +-24, real) |
| Mirpur 11 | A/B | +1/-1 | +1/+1 |
| Pallabi | A/B | +1/-1 | +1/+1 |
| Uttara South | A/B | -1/+1 | +1/+1 |

At each 2-entrance station one of the two entrances landed with its
walkable stair's direction opposite its own shell's — the stair projects
out of the shell into open air (the owner's Pallabi screenshot: "a bare
staircase ... hanging in open air ... no brick shell around it"). Which
entrance broke was decided by the sign of a rounding error, which is why
Uttara South came out flipped relative to Mirpur 11 and Pallabi.

**Fix.** `metro.js` now computes `stairSign` once, per entrance, as the
single source of truth, and never keys off the sign of a value that can
legitimately be exactly 0:

```js
const stairSign = zc !== 0 ? (zc < 0 ? -1 : 1) : (side < 0 ? -1 : 1);
```

When `zc` is nonzero (Mirpur 10's 4 legs) this is byte-for-byte the old
rule — zero behavior change there, per the brief's "Mirpur 10 is
unchanged" acceptance item. When `zc` is exactly 0 (every 2-entrance
station), it falls back to `side` (`-1`/`+1`, never zero, and already
opposite between the loop's two entrances), so the two entrances resolve
to opposite `stairSign` — a genuine mirror image of each other (opposite
stair direction as well as already-opposite X), not both defaulting to
`+1` and not dependent on float noise. `entrances.push()` now publishes
this value as `dir`, plus the exact local `lz: zc` (known here, never
recovered through trig later), on every entrance record. `interior.js`'s
half of this fix (consuming `dir`/`lz` instead of re-deriving them) is
logged in `docs/INTERIOR-PASS.md`'s matching dated section.

**Stations reasoned through:** Mirpur 10 (4-leg, unaffected — confirmed
the new ternary's nonzero branch is identical to the old expression),
Mirpur 11, Pallabi, and Uttara South (all 2-leg — confirmed each now gets
one entrance at `dir=-1` and one at `dir=+1`, sourced from `side`, never
from the sign of the exactly-zero `zc`).

**Not verified live:** the actual rendered geometry at Pallabi, Mirpur 11
and Uttara South (brick shell fully enclosing the stair, doorway at the
footpath end, from multiple angles) — that is the advisor's pass per this
session's standing rule against using the browser preview tools.

## 2026-09-08 — P11-R: entrance placement is now building-aware, not a fixed +-16.5 m offset

Executor (Sonnet) worked to `docs/briefs/P11-R-ENTRANCES-INSIDE-BUILDINGS.md`.
Owner: `src/metro.js` and `src/interior.js` only. Not verified live — the
advisor re-runs the point-in-polygon test and does the visual walk-through;
everything below is reasoned from the geometry and confirmed with a
throwaway Node harness (fake `document`/`canvas`, real `three`, actual
`buildMetro()` executed against `public/scene-north.json`), not the browser.

**Root cause (confirmed).** `coreOffset = roadHalf + 4.5 = 16.5` was a
single fixed number applied to every entrance at every station, with no
reference to `scene.buildings` at all. Where the real frontage happened to
sit back from the road (Mirpur 10 A, Mirpur 11 originally) it landed on
clear footpath; everywhere else it landed inside whatever OSM building
happened to be there — both entrances at Pallabi included.

**Fix.** `buildStation()` now receives `scene.buildings` (threaded through
from `buildMetro()`) and, per entrance, searches for a station-local
`(coreX, zc)` that is simultaneously:
- outside every nearby building footprint — tested as a full rectangle
  (the shell's real `shellHalfW*2` width x `STAIR_RUN` length, plus a
  0.3 m clearance margin), not a single centre point: any building vertex
  inside the rectangle, any rectangle corner inside the building, or any
  polygon edge crossing a rectangle edge all count as a hit;
- outside the carriageway (mirrors the existing `PORTAL_COL_X` boundary);
- clear of the portal columns, best-effort (see below).

Buildings are transformed into the station's local (unrotated) frame ONCE
per station (`worldToLocalXZ`, the exact inverse of the local -> world
transform this file already used to publish `wx`/`wz`), filtered first to
those with any vertex within 250 m of the station centre. That radius
matters more than it sounds: the first attempt used 90 m ("comfortably
beyond the search range"), and it silently passed Pallabi A, because the
building actually burying it (id `1008072207`) has its NEAREST vertex
90.4 m from the station centre while its footprint still reaches to within
16.5 m of the spine. A large building can have every vertex far from a
station while a whole side of it cuts across the corridor. Re-verified
with the wide-radius version: all 10 published entrances now come back
footprint-clear against `scene.buildings` directly (own script, not the
in-file search, so it isn't just checking its own homework).

**Search order (per the brief).** For each entrance: try the nominal
position first (byte-identical to the old formula) and keep it unchanged
if it already clears buildings and the carriageway — this is what keeps
an already-good entrance from being nudged sideways just because a
stricter check also grazes a portal column. If the nominal position fails,
slide along the spine (local Z, +-1 m steps, bounded to the concourse's
own +-29 m span) first, then outward in local X (+1 m per step, up to
+40 m past nominal) if nothing along Z works at that offset. Whichever
combination clears buildings AND columns wins; if the search only ever
finds spots that clear buildings but not a column, that best-effort
fallback is used rather than dropping the entrance (columns are a soft
preference here, buildings and the carriageway are hard). If nothing in
the whole search box clears every building, the entrance is dropped and
`console.warn`'d — did not happen for this scene (all 10 found a spot; see
the table below).

**A finding beyond the brief's own measured table: Mirpur 10 B.** The
brief's live point-in-polygon table says Mirpur 10 B is NOT inside a
building — true of its single foot point. But this pass's rectangle test
(testing the WHOLE `STAIR_RUN`-length footprint, as the brief itself asks
for: "a centre point that clears a wall by 10 cm is still a broken
entrance") found building `369713510` overlapping roughly 4.6 m of the
shell's 5.2 m width and 10 m of its 14.6 m run length — not a graze, a
real intersection along most of the run, just not at the exact tested
point (the foot, at the far end of the run from the building). This
entrance was moved (nominal local `(-16.5, 24)` -> `(-17.5, 1)`) even
though the acceptance list says "Mirpur 10 A and B are unchanged". A is
genuinely unchanged (its full footprint really is clear); B is not, and
this doc flags that explicitly rather than silently deviating from the
acceptance text — advisor: worth a specific look at Mirpur 10 B's stair
run in the browser given this is the one case where "correct today" and
"clear today" disagree.

**Known pre-existing, out-of-scope overlap.** Two of the UNCHANGED
entrances — Mirpur 10 A and Uttara South B — graze a portal column by a
few centimetres in their shell's inner wall (checked: real, not a margin
artifact, present even at zero clearance margin). This is not something
the brief's acceptance criteria asked about (only buildings and the
carriageway are graded), and fixing it would have meant moving two
entrances the brief explicitly wants unchanged — so it was left alone and
is called out here rather than fixed silently or hidden. It predates this
pass; the search's own column-avoidance logic only applies to entrances
that already had to move for a building.

**Final positions, all 10 entrances** (station-local `(coreX, zc)`, world
`(x, z)`, and clearance status against `scene.buildings` re-checked
directly, independent of the in-file search):

| station | entrance | moved? | local (coreX, zc) | world (x, z) | clear of buildings | clear of carriageway |
|---|---|---|---|---|---|---|
| Mirpur 10 | A | no | (-16.5, -24.0) | (170.5, 613.2) | yes | yes |
| Mirpur 10 | B | **yes** | (-17.5, 1.0) | (165.4, 588.7) | yes | yes |
| Mirpur 10 | C | yes | (21.5, -24.0) | (133.7, 622.4) | yes | yes |
| Mirpur 10 | D | yes | (21.5, 24.0) | (122.0, 575.9) | yes | yes |
| Pallabi | A | yes | (-24.5, 0.0) | (-241.9, -1387.6) | yes | yes |
| Pallabi | B | yes | (17.5, 24.0) | (-284.7, -1410.1) | yes | yes |
| Uttara South | A | yes | (-24.5, 0.0) | (-356.1, -3585.4) | yes | yes |
| Uttara South | B | no | (16.5, 0.0) | (-397.1, -3584.2) | yes | yes |
| Mirpur 11 | A | yes | (-19.5, 27.0) | (-142.5, -631.8) | yes | yes |
| Mirpur 11 | B | yes | (17.5, -15.0) | (-167.6, -581.8) | yes | yes |

**No entrances dropped.** Every one of the 10 found a clear spot within
the search bounds (max offset actually used: +8 m past nominal, at Pallabi
A and Uttara South A; max Z slide: 27 m, at Mirpur 11 A — both comfortably
inside the +40 m / +-29 m search limits, so the limits themselves were
never the binding constraint).

**`src/interior.js`: one small, targeted change, everything else confirmed
unnecessary by inspection.** It already consumes `en.x`/`en.z`/`en.lz`/
`en.dir` generically via `entranceLocal()` (P11-Q), with no station- or
position-specific assumptions, so every entrance's new position, and
Mirpur 11's now-nonzero `lz` in particular (0 -> 27, which also flips that
entrance's `dir` from the `side`-sourced fallback to the `zc`-sign branch —
still the SAME formula computing both the shell and the published `dir`,
so shell and interior stair can't disagree), is picked up automatically.
But checking that (rather than assuming it) surfaced a real second-order
defect: the lift's Z anchor, derived from entrance A's `lz`, moved close
enough to a portal column at Mirpur 11 to actually clip it (0.5 m
clearance where ~1.75 m was needed). `PORTAL_COL_SIZE` is now also
exported from this file (alongside the already-exported `PORTAL_COL_X`) so
interior.js's fix — a small nudge off the nearest portal column, added to
`buildLift`'s Z placement — doesn't hardcode this file's own column size a
second time. See `docs/INTERIOR-PASS.md`'s matching dated section for the
full writeup and the exact numbers.

**Also unchanged:** `setPlatformDoors`/`platformDoorBays`/`setPsdOpen`
signatures, the P11-Q `dir`/`lz` publication contract itself (only the
values changed, not the fields or their meaning), the lift's
adjacent-floor/ticket-gating logic, entrance-shell riser geometry, albedo
normalisation, platform floor at `DECK_Y`. Draw-call count is unaffected
(same buckets, same bake calls per entrance — only the position numbers
feeding them changed).

**Verification method (not the browser).** A throwaway Node script
(deleted, not part of the diff) stubbed `document.createElement('canvas')`
and `window`, imported `three` for real, and called this file's own
`buildMetro(scene, labelFactory)` against `public/scene-north.json`
exactly as `main.js` would, then re-ran BOTH a point-in-polygon test and a
full-rectangle overlap test against `scene.buildings` directly (not
reusing this file's internal building list) on the actual returned
`stations[].entrances[]`. All 10 came back clear on both tests; zero
`console.warn` drops fired. `npx vite build` also ran clean (no syntax/
type errors) with the resulting `dist/` deleted immediately after, per the
brief's no-server / no-commit constraints.

## 2026-09-08 — P11-T: entrance shell rebuilt as one raked enclosure (third attempt)

Executor (Sonnet) worked to `docs/briefs/P11-T-ENTRANCE-SHELL-REBUILD.md`.
Owner: `src/metro.js` (this section) and `src/interior.js` (see
`docs/INTERIOR-PASS.md`'s matching dated section). Not verified live — the
advisor checks at Pallabi and Uttara South per the brief; everything below
is reasoned from the geometry and confirmed with a throwaway Node harness
(stubbed `document`/`window`/`fetch`, real `three`, actual `buildMetro()`
executed against `public/scene-north.json`), not the browser.

**Why a third attempt.** P11-B's 6 Z-stepped segments and P11-P's
riser-panelled 10-segment version were both "fixed" and both still read,
from outside, as a stepped brick ziggurat — a staircase of stacked boxes
with pale flat caps, never a single building. The owner sent three
screenshots and called it "empty"/"looks bad"; the advisor confirmed the
same read live at Pallabi. The stepped construction itself was the defect
(not a gap in it), so this pass replaces the massing entirely rather than
patching it a third time, per the brief's explicit instruction.

**New massing, per entrance:**
- **Two side walls**, each ONE `THREE.Shape` trapezoid
  ((0,0)-(STAIR_RUN,0)-(STAIR_RUN,y1)-(0,y0), closed) extruded by `wallT`
  via `ExtrudeGeometry`, instead of 10 stacked boxes. `y0`/`y1` are the
  wall height at the footpath foot (`clearance` = 2.9 m) and at the
  concourse end (`clearance + CONCOURSE_Y`) — the same two numbers the old
  code's `topYs[0]`/`topYs[SEGMENTS-1]` bracketed, so the new single rake
  starts and ends exactly where the old stepped one did.
- **One raked roof slab**: a single box, length = the SLANT length
  (`Math.hypot(CONCOURSE_Y, STAIR_RUN)`, not the run itself, so its
  horizontal projection after rotating comes out to exactly `STAIR_RUN`
  rather than falling short), rotated about local X by
  `-stairDir * Math.atan2(CONCOURSE_Y, STAIR_RUN)` — the ONLY rotation in
  the whole shell whose angle is a function of a continuous value.
- **A head wall** at the concourse end: jambs either side of a doorway
  opening, based on the landing floor (`CONCOURSE_Y`) rather than the
  street. By construction `y1 - CONCOURSE_Y === clearance`, so the full
  available height above the landing there is already exactly one
  doorway's worth of headroom — there's no spare band above the opening
  the way the footpath end has one below its doorway.
- **The footpath doorway** (3.0 x 2.6 m, jambs + band) is unchanged in
  size/position, per the brief's "keep the doorway exactly where it is
  now" — only its jamb height changed, from the old `topYs[0]` to the new
  `y0` (the same value, computed differently: `y0` is now a directly
  computed constant instead of the first element of a 10-element array).
- **A floor slab** (0.3 m thick, flat, at street level) under the whole
  footprint, closing the "shell stands on bare earth with daylight
  underneath" gap from the owner's screenshots. interior.js still owns the
  actual rising stair/escalator floor above it.

**Why the rotation signs are safe to trust without a browser.** The side
walls' rotation is a FIXED +-90 deg about Y (`-stairDir * Math.PI/2`) —
not a function of a continuous angle, so there is no sign-of-a-slope to
get subtly wrong, only a binary choice, verified by hand (see below) for
both `stairDir` values. The roof's rotation IS a function of a continuous
value (`atan2(rise, run)`, per the brief), so its sign matters more: naive
`Math.atan2(CONCOURSE_Y, STAIR_RUN)` alone always tilts the high end
toward +Z, which is only correct for half of this station's entrances
(`stairDir = -1` climbs toward -Z) — negating by `stairDir` is what makes
the same formula correct for both.

**Hand-verified (Node script using real `three.Quaternion`/`BoxGeometry`
math, not eyeballed) at all four entrances of Pallabi and Uttara South —
both stations the brief names, and both `dir` values at each:**

| entrance | dir | zc | coreX | wall world-Z bbox | wall world-X bbox | roof world-Z bbox | roof world-Y bbox |
|---|---|---|---|---|---|---|---|
| Pallabi A | -1 | 0 | -24.5 | [-14.00, 0.00] | [-27.20,-27.00] | [-14.47, 0.47] | [2.54, 11.26] |
| Pallabi B | +1 | 24 | 17.5 | [24.00, 38.00] | [14.80, 15.00] | [23.53, 38.47] | [2.54, 11.26] |
| Uttara South A | -1 | 0 | -24.5 | [-14.00, 0.00] | [-27.20,-27.00] | [-14.47, 0.47] | [2.54, 11.26] |
| Uttara South B | +1 | 0 | 16.5 | [0.00, 14.00] | [13.80, 14.00] | [-0.47, 14.47] | [2.54, 11.26] |

In every row the wall's Z-span runs from `zc` to `zc + stairDir*STAIR_RUN`
(the low end at the footpath, the high end toward the concourse — never
reversed), the wall's X-span sits flush on `coreX +- shellHalfW +-
wallT/2` with no drift, and the roof's Z-span brackets the same run (plus
the small overhang) with its Y-span bracketing `y0..y1` — confirming both
the fixed +-90 deg wall rotation and the `atan2`-based roof rotation are
correct for both `dir = -1` (Pallabi A, Uttara South A) and `dir = +1`
(Pallabi B, Uttara South B), not just one.

**A real bug the Node harness caught before this ever reached the
advisor.** The first version of this pass's wall code merged
`ExtrudeGeometry` into the same `brick` bucket as the (indexed)
`BoxGeometry` jambs/risers. `ExtrudeGeometry` is non-indexed by default;
`BoxGeometry` is indexed — `mergeGeometries()` (BufferGeometryUtils)
throws ("All geometries must have compatible attributes ... index
attribute ... in none of them") the moment two such geometries land in
the same merge bucket. Running `buildMetro()` against the real scene in
the Node harness surfaced this immediately (a plain `npx vite build` does
not — it only type/syntax-checks, it does not execute the scene-building
code path). Fixed with `mergeVertices()` (already available from the same
`BufferGeometryUtils` import) on each wall geometry before baking it,
which both de-duplicates vertices and produces the matching indexed
form. Re-ran the harness after the fix: `buildMetro()` completes with no
throw and no non-finite bounding boxes on any `brick`/`concrete`/
`concreteDark` merged mesh at Pallabi.

**Draw calls.** Unaffected in COUNT — the entrance shell still buckets
into the same four materials (`brick`, `concrete`, `concreteDark`,
`band`), each merged into one mesh per station regardless of how many
individual boxes/trapezoids feed it — but each entrance now bakes far
fewer primitives (2 walls + 1 roof + 2 head jambs + 2 door jambs + 1 band
+ 1 floor = 9, versus the old 10-segment version's 10*3 + 9 risers + 3 end
wall = 42), so total triangle/vertex count drops substantially even
though the merged mesh count per station is the same.

**Not changed:** `setPlatformDoors`/`platformDoorBays`/`setPsdOpen`
exports, the lift's footpath position/adjacent-floor rule/ticket gating,
`dir`/`lz` publication (P11-Q) and building-aware placement (P11-R) —
only the visual massing built AROUND each entrance's already-published
`(coreX, zc, dir)` changed, not how that position is computed. Albedo
normalisation and the platform floor at `DECK_Y` are untouched (this pass
never touches the platform-side buckets).

**Not verified live:** the actual rendered look from outside (one clean
sloped-roof building, no stepped profile) and from inside (walls, roof,
floor, daylight only through the doorway and the concourse-end opening) —
that is the advisor's pass per this session's standing rule against using
the browser preview tools. `npx vite build` ran clean; `dist/` was deleted
immediately after, per the brief's no-server/no-commit constraints.
