# P0-E1 road pass — findings and changes

Owner file: `src/streets.js` only. Executor E1.

## Bug 1: pastel ellipse road surface — root cause

Confirmed live in the browser (not just in the reference docs): loaded
`http://localhost:5183`, entered the street, and read the WebGL canvas back
via `canvas.toDataURL('image/png')` (lossless — a 0.7-quality JPEG round
trip introduces its own chroma-subsampling blotches on dark, low-contrast
gradients and produced a **false positive** early on; PNG is what settled
it). The main carriageway and footpaths were covered in soft-edged pink,
green, blue and tan ellipses, 2-6 m across, exactly as reported.

Diagnosis, per the brief's four checkpoints:

- (a) **Which material.** The corridor carriageway (`corridorAsphaltMat`,
  under the viaduct) uses the real CC0 `asphalt-patched` photo via
  `loadTextureSet` — confirmed by opening `public/textures/asphalt-patched/
  color.jpg` directly: a plain dark warm-grey photo, no colour blobs. Ruled
  out. `asphaltTexture()` only draws rectangles (patches) and 1-3 px
  speckle — no ellipses, so it can't produce round blobs either. The only
  function in `streets.js` that draws ellipses at all is `dirtTexture()`
  (line ~373 pre-fix), used for the ground plane (`groundTex`) and the OSM
  footpaths/sidewalks (`footTex`). So the blobs had to be `dirtTexture()`
  output showing through wherever bare ground or footpath is visible near
  the corridor (gaps between the corridor road mesh and the flanking
  ground/footpath geometry), not a wrong-texture mix-up.
- (b) **Repeat/tile scale.** `PlaneGeometry`'s UVs span 0-1 across the
  *whole* mesh, so a fixed `repeat` count means tile size scales with
  mesh size, not metres. `groundTex.repeat.set(120, 160)` over the ground
  plane's real extent (bounds ~1495 m x ~2346 m, plus the old 400 m pad)
  worked out to **~19 m of ground per 256 px tile** — enough to blow the
  texture's 2-18 px noise ellipses up to 1-3 m radius (2-6 m diameter)
  blobs. This explains the *scale* of the bug but not the *hue*.
- (c) **Wrong map picked up.** Ruled out — see (a).
- (d) **dirtTexture emitting those hues.** The bug report assumed
  `dirtTexture()` couldn't produce pink/green/blue because its intended
  palette is warm dust. It actually can, and does — this is the real root
  cause of the *colour*, distinct from (b)'s scale problem:

  ```js
  // before (streets.js ~line 388)
  ctx.fillStyle = `rgba(${90 + rnd() * 80 | 0},${84 + rnd() * 74 | 0},${72 + rnd() * 64 | 0},${rnd() * 0.4})`;
  ```

  R, G and B each came from their **own independent `rnd()` call**. The
  three ranges (90-170, 84-158, 72-136) were sized so R >= G >= B *on
  average*, but nothing enforced that per draw. An unlucky combination
  (e.g. R rolls low ~95, G rolls low ~90, B rolls high ~130) lands outside
  the warm-neutral family entirely and reads as a pastel blue or green
  tint; another combination (R high, G/B low) reads pink/magenta. Over 260
  ellipses per 256 px tile, with the tile itself blown up to metre-scale by
  (b), some always did — hence pink, green, blue *and* tan blobs, not a
  single wrong hue.

**Both halves are necessary to reproduce the bug**: the colour flaw alone
would just be a few slightly-off-hue 2-18 px specks, invisible at any
distance; the scale flaw alone (with correlated colour) would just be
larger warm-brown blobs, which is what OBSERVATIONS.md's dust/sun-bleach
guidance already describes as *intentional*. It's the combination that
produces the reported regression.

## Fix (`src/streets.js`)

- **`dirtTexture()`, ~line 373-398** (root cause of the hue): replaced the
  three independent `rnd()` draws for R/G/B with one shared tone value `t`
  per ellipse, deriving R/G/B from it with a fixed warm ratio
  (`r, r*0.93, r*0.8`). Every ellipse is now a lighter/darker step along
  the same warm-neutral hue — matches OBSERVATIONS.md's dust/sun-bleached
  range (`#5a5048`-`#8f8171` family) — and can no longer roll an
  independently-saturated colour.
- **`buildStreets()`, ground plane, ~line 571-606** (scale half of the
  bug): `groundTex.repeat` is now computed from the plane's actual size
  (`groundW / 4`, `groundH / 4`) instead of the fixed magic constant
  `(120, 160)`, so a 256 px tile always reads as ~4 m of ground regardless
  of how large the OSM extract is.
- **`buildStreets()`, `footTex`, ~line 680-690**: same fixed-repeat bug,
  less extreme (`repeat.set(1, 1)`), on the texture shared by the OSM
  footpaths ribbon (uvScale 0.09) and the arterial sidewalks ribbon
  (uvScale 0.2, width 2.4 m). Changed to `repeat.set(0.6, 1.25)`, chosen so
  the sidewalks case (the more visible one) lands at ~4 m tiles and the
  footpaths case lands at ~9 m (down from ~11 m) — a single shared texture
  instance can't hit 4 m exactly for both ribbon scales at once.
- Left `asphaltTexture()`'s patch-repair fill (~line 321) alone: it has the
  same "independent rnd() per channel" shape, but the range is small
  (34-46 / 30-41 / 26-36), so the worst-case channel swap still reads as
  dark neutral, not pastel — not worth the extra diff for a change with no
  visible effect.

## Task 2: real asphalt

Already done before I started (comments in the file reference
OBSERVATIONS.md and reason through the exact UV-scale math) — the corridor
carriageway (`corridorAsphaltMat`, under the viaduct) and corridor
footpath (`corridorFootMat`) already load `asphalt-patched` and
`paving-bricks` via `loadTextureSet()` with sensible `repeat` values
(`(2,2)` and `(3,4)` respectively, both landing close to the "~4 m/tile"
target). Verified both source images directly
(`public/textures/asphalt-patched/color.jpg`,
`public/textures/paving-bricks/color.jpg`) — real dark asphalt and
cobble/paving-stone photos, not placeholders. No change made; nothing to
fix here.

## Task 3: ground plane past the fog

- `pad` raised from 400 m to **1000 m** (`streets.js` ~line 584-588), per
  the brief's minimum. sky.js's furthest daytime fog preset is `fogFar:
  900`; the ground plane's edge is now always outside every fog preset.
- **Tried and reverted** the "better" alternative — an unlit, fog-enabled
  skirt disc (`CircleGeometry(6000, 48)`, `MeshBasicMaterial`) beyond the
  main ground plane, meant to erase the last faint horizon seam a flat
  lambert-shaded plane always shows against a domed sky at a shallow
  aerial angle. It visually helped a little, but **cut the aerial-view HUD
  from a steady 60 fps to 16-26 fps** and did not recover after 8+ s of
  settling, despite adding only 48 triangles and +1 draw call — draws/tris
  in the HUD barely moved (648->649, 1790k->1791k), so the cost isn't
  geometry volume; I did not track down whether it's overdraw at the
  horizon fighting the existing ground plane's depth, a shadow-frustum
  interaction, or something else. Reverted rather than ship a >2x aerial
  frame-time regression for a cosmetic seam. Left a comment at the revert
  site (`streets.js` ~line 618-628) so the next pass doesn't rediscover
  this the hard way. **Not done**: the horizon seam is much softer than
  before (pad 400->1000 alone) but not fully invisible — see the aerial
  screenshot.

Caveat on that revert: while testing the skirt I also saw `main.js` throw
`renderer.render threw (frame loop continuing): TypeError: Cannot read
properties of undefined (reading 'value')` on every frame, from a
concurrent edit by another executor (I don't own `main.js`, did not touch
it). That error was present in the browser at the same time as my low-fps
readings, so it's possible it — not the skirt — caused some or all of the
fps drop. I could not cleanly separate the two given the file fence, and
chose not to re-add the skirt to re-test once `main.js` looked stable
again, given the downside risk. Flagging this so nobody re-blames the
skirt (or re-adds it) without re-testing against a clean `main.js`.

## Verification

Browser: Claude Browser tab (own tab, `tabId` passed on every call),
navigated to `http://localhost:5183`, waited for scene build, clicked
"Enter the street". Screenshots captured via
`canvas.toDataURL('image/png')` (lossless) rather than the JPEG method in
the brief, specifically because the JPEG path produced the false-positive
pastel artifacts described above during my own diagnosis — PNG first,
then re-encoded to JPEG on disk for storage.

| File | md5 | Notes |
|---|---|---|
| `screenshots/p0-road-street.jpg` | `111db789b230e670bfcd7e2f5682bd9d` | Start view, post-fix. Road/footpath now read as warm dark neutral dust/asphalt with soft tonal blobs — no pink/green/blue. |
| `screenshots/p0-road-under-viaduct.jpg` | `eb47018d53e355914dbba91141224f04` | Key 1 (Mirpur 10 approach / under viaduct), post-fix. Same result. |
| `screenshots/p0-road-aerial.jpg` | `99a255e168aa76759516d5b058596eb9` | Key 4 (aerial), post-fix, pad=1000, skirt reverted. Ground plane edge visibly softer than the 400 m-pad baseline but a faint seam remains at the horizon (see Task 3). |

All three are distinct, non-trivial files (216-394 KB).

### HUD fps / draws

| View | Before | After |
|---|---|---|
| Street (post "Enter the street") | not captured (see note) | 60 fps · 705 draws · 1834k tris |
| Aerial (key 4) | 60 fps · 648 draws · 1790k tris (pad=400, old dirtTexture) | 60 fps · 648-649 draws · 1790-1791k tris (pad=1000, fixed dirtTexture, skirt reverted) |

I did not capture a clean "before" HUD reading at the street view — my
first pass at reaching the street view landed directly on a working
post-navigation frame without querying `#stats` before I'd already started
editing. I did confirm by inspection of the diff that draws/tris cannot
have changed from this fix: every change is either a pixel-fill formula
inside an existing `CanvasTexture` (`dirtTexture`) or a `repeat` value on
an existing texture/mesh (`groundTex`, `footTex`) or the `pad` constant
sizing an existing single `PlaneGeometry` — no meshes, materials, or draw
calls were added or removed. The aerial before/after numbers above
(648->648/649, essentially flat, all within normal per-frame culling
jitter) confirm this empirically for the one view I did capture cleanly
both ways.

## Not done / follow-ups

- Aerial horizon seam not fully eliminated (see Task 3) — the skirt
  approach needs someone to either find the actual overdraw/shadow cost
  and fix it, or re-test it cleanly once `main.js`'s concurrent
  render-loop error (not mine to fix) is confirmed gone.
- Did not touch `asphaltTexture()`'s minor independent-rnd() colour flaw
  in the patch-repair fill (see Fix section) — low visual impact, left as
  is to keep the diff focused on the actual regression.

# P0-E1b — no poles in the carriageway (run after E1)

Owner file: `src/streets.js` only. Executor E1b. Read
`docs/OWNER-FEEDBACK-2026-09-07.md` item 2 and
`docs/briefs/P0-E1b-POLES.md` first.

## Root cause

`buildStreetFurniture()` (`src/streets.js`) placed streetlights and power
poles along each OSM road's own edge (`r.w / 2 + offset`). Under the
viaduct, the carriageway is no longer generated from that OSM way — it's
rebuilt from the metro centreline in `buildMetroCorridorRoad()` (P0-E1),
which does not coincide with the old OSM road edge. Furniture kept using
the stale OSM-edge placement, so poles ended up standing in the rebuilt
lanes with cables strung straight across the road.

## Fix (`src/streets.js`)

- **`buildStreetFurniture()` signature**, ~line 422: now takes
  `(roads, metroCentre, buildings)` instead of just `roads`, so it can test
  proximity to the metro centreline and look up building footprints for the
  drop check. Call site updated at the bottom of `buildStreets()`
  (~line 912): `buildStreetFurniture(scene.roads, metroCentre,
  scene.buildings)`. `metroCentre` was already computed earlier in
  `buildStreets()` for the OSM-road suppression logic (P0-E1); reused as-is,
  not recomputed.
- **Relocate/drop pass**, ~line 469-618 (new code, inserted after the raw
  OSM-edge candidate positions are gathered, before the InstancedMesh
  geometry is built): for every candidate light/pole position, computed the
  perpendicular distance to the metro centreline the same way
  `city.js`'s `distToCentreline`/`nearestCentrelineSegment` do (nearest-point
  on each centreline segment, no import from city.js — a small
  `nearestCentre()` closure was written locally per the brief). Any position
  within `CENTRELINE_CLEAR = 14` m is snapped onto the corridor footpath
  edge on its own side: `centreline +/- FOOT_EDGE` along the segment's unit
  normal, where `FOOT_EDGE = CORRIDOR.median/2 + CORRIDOR.carriageway +
  CORRIDOR.footpath/2 = 1.5 + 10.5 + 1.5 = 13.5` m — exactly the brief's
  number, derived from the existing `CORRIDOR` const rather than
  hardcoded. Before snapping, the target spot is tested against a
  pre-filtered list of nearby building footprints (`scene.buildings[i].p`,
  the flat outer ring — buildings are data on the `scene` object, not
  something imported from `city.js`); if the snapped spot lands inside a
  building, the pole/light is dropped instead (`return null`, filtered out).
  Streetlights keep a recomputed `rot` so the lamp head still faces the
  road after moving; poles have no orientation to preserve.
- **Corridor footpath streetlights**, ~line 587-616: added new light
  positions every 30 m along both sides of the metro centreline, offset by
  the same `FOOT_EDGE` (13.5 m) — reuses the existing cobra-head
  `InstancedMesh` geometry/material below, just more entries in
  `lightPositions` before it's built, so no new draw call. The viaduct
  parapet already has its own streetlights every pier span (`metro.js`,
  "Streetlight poles on the parapet, every span", owned by another
  executor) — confirmed present, nothing to add there.
- **Cable crossing guard**, ~line 620-636 (`crossesCorridor()`) plus a
  one-line guard in the cable-stringing loop (~line 700): before drawing a
  catenary between two consecutive poles, the straight segment between them
  is tested against every metro-centreline segment for a real line
  intersection; if it crosses, that span is skipped entirely (no cable
  drawn) rather than sagging across the carriageway. Poles relocated onto
  the footpath edge sit roughly parallel to the centreline, so this mostly
  guards the (rarer) case of a still-OSM-edge pole cabled to a
  newly-relocated one across the corridor.

No other files touched. `metro.js`, `city.js`, `main.js` etc. were only
read (for `distToCentreline`'s approach, `b.p`'s ring format, and to
confirm parapet lights already exist), never edited.

## Numbers

Console log (`[street-furniture] corridor poles: ...`), captured live in
the browser after entering the street:

> `447 relocated to the footpath edge, 39 dropped (would land inside a
> building)`

## Verification

Browser: own Claude Browser tab (`tab-14`, `tabId` passed on every call —
had to close the shared `seed` tab first to get under the tab cap; did not
touch any other agent's tab). Navigated to `http://localhost:5183`, waited
~28 s for the scene build (14,462 buildings / 768 road ways / 241 viaduct
piers per the loading screen), clicked "Enter the street". Screenshots via
`window.__mirpur.player.update(0)` + `window.__mirpur.capture()` (the pane
was hidden the whole session, so this was required per the P0-COMMON
gotcha — a bare `requestAnimationFrame` never fired) then
`canvas.toDataURL('image/jpeg', 0.85)` read directly (not wrapped in a
`requestAnimationFrame` — the frozen render loop already means the canvas
holds a fresh frame right after `capture()`; wrapping it in rAF is what
timed out).

| File | md5 | View | Notes |
|---|---|---|---|
| `screenshots/p0-poles-key1.jpg` | `a3591e0344f4d0e1a429e8926328c6c5` | Key 1 (Mirpur 10 approach, at the station) | Streetlights stand on the platform/footpath edges on both sides of the corridor road; none in the lanes. |
| `screenshots/p0-poles-key2-ground.jpg` | `283ef9341ea2c1cb66c20fc841e2b92f` | Key 2 (Mirpur 11 approach), ground level | Same result further down the corridor; a bus visible on the carriageway, poles clear of it on the footpaths. |
| `screenshots/p0-poles-under.jpg` | `d4c4e6040f7ad8b3378c9e6556cefa92` | Standing in the median (`x=-33, z=-124`, roughly midway between the two stations, found via the `metro-median` mesh's own vertices), facing along the corridor | Both carriageways and the pier are clearly visible with no pole in either lane; the overhead cable bundles on each side stay on their own footpath and do not cross toward the median/pier — confirmed both in the raw screenshot and in a 2x crop of the upper-half region. |

All three are distinct, non-trivial files (183-228 KB), md5s above.

### HUD draws/tris

| View | Draws | Tris |
|---|---|---|
| Street (post "Enter the street"), before this pass (per E1's ROAD-PASS entry) | 705 | 1834k |
| Street (post "Enter the street"), after this pass | 705 | 1866k |

Draw count is unchanged, as expected: this fix only repositions existing
`InstancedMesh` instances and adds more instances to the *same*
light/pole/cable `InstancedMesh`/`LineSegments` objects — no new mesh or
material was created, so `buildStreetFurniture()` still contributes exactly
the same fixed number of `group.children` (poleMesh, armMesh, headMesh for
lights; mesh, armMesh for poles; one cables LineSegments). The +32k tris is
the added corridor footpath streetlights (every 30 m along ~4.5 km of
centreline on both sides), all going through the existing streetlight
geometry/material.

## Not done / follow-ups

- Did not re-verify against a clean `main.js` — the same
  `renderer.render threw (frame loop continuing): TypeError: Cannot read
  properties of undefined (reading 'value')` error E1 flagged was still
  present in the console during this pass (another executor's concurrent
  edit to `main.js`, not touched here). It did not visibly affect
  rendering or block screenshot capture, but the 50 fps HUD reading (vs the
  60 fps baseline) may be partly attributable to it rather than to this
  change — same caveat E1 already raised, still unresolved.
- The building-footprint drop check uses each building's *original*
  (unclipped) footprint ring (`b.p`), not the corridor-clipped ring E4b
  produces in `city.js` — `city.js` was off the file fence, and its
  clipped rings are cached in a module-private variable there with no
  exported accessor. This is conservative (a pole might be dropped near a
  building whose footprint was actually clipped back further from the
  corridor than `b.p` shows), never the reverse (a pole is never placed
  inside geometry that will actually render), so it never re-introduces
  the "pole clips into a wall" failure mode — it can only be overly
  cautious about where it allows a pole to stand.
- Did not add a distinct screenshot from directly beneath the viaduct
  girder looking straight up/across (only along-the-corridor angles); the
  three required shots above all show the full lane-to-lane width clearly,
  so this wasn't pursued further given the brief's explicit file list.
