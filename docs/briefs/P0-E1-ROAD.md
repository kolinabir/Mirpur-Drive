# P0-E1: road surface regression + photographic road textures

Owner file: `src/streets.js` ONLY. Docs you own: `docs/ROAD-PASS.md` (create).
Read first: docs/briefs/P0-COMMON.md, reference/road/OBSERVATIONS.md,
docs/REVIEW-2026-09-07.md (section "What the live render shows").

## Bug 1 (must fix): pastel ellipse road surface
Live render shows the main carriageway and footpaths covered in large
pastel ellipses (pink, green, blue, tan), 3 to 8 m across. Neither
`asphaltTexture()` (line ~288) nor `dirtTexture()` (line ~373) emits those
hues. Diagnose before editing: check (a) which material each road mesh
actually gets (`buildMetroCorridorRoad`, the OSM road ribbons, footpaths);
(b) the `repeat` set on each CanvasTexture: a 256 px tile repeated too few
times makes 2-18 px ellipses into metre-scale blobs; (c) whether the road
material picked up the facade atlas or a CC0 map by mistake; (d) whether
`dirtTexture` alpha blobs with a light base read as pastel under sRGB.
Write the root cause in docs/ROAD-PASS.md before fixing it.

## Task 2: real asphalt
Use `loadTextureSet(slug)` from `src/textures.js` (you may import it; do not
edit it). Check public/textures/MANIFEST.json for an asphalt/concrete/paving
slug. If an asphalt map exists use it as `map` with the procedural canvas
overlay only for wheel bands/patches; if not, keep procedural but match
OBSERVATIONS.md values: base #5c5249 warm mid-dark, patches #2a2724, dust
#8a7c68 at edges only. Roads must read as asphalt at 1.7 m eye height AND at
the 300 m aerial. Texture repeat: about one 256 px tile per 4 m of road.

## Task 3: ground plane past the fog
`buildStreets` ground pad is 400 m (line ~572) but sky.js fogFar goes to
900. The aerial view shows a hard plane edge. Make the pad >= 1000 m, or
better, add a second cheap skirt plane of the fog colour beyond it.

## Verify
Screenshots to disk: screenshots/p0-road-street.jpg (start view),
p0-road-under-viaduct.jpg (press 1), p0-road-aerial.jpg (press 4). Compare
against reference/road/*.jpg and reference/metro/photos/26. Record fps and
draw calls from the HUD before/after in docs/ROAD-PASS.md.

## ADDED 18:15 — owner Street View, streets.js items (for the next road pass)
Source: reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md. Visible from the
new Mirpur 12 / Pallabi spawn:
- **Median kerb is painted in alternating BLACK AND WHITE bands.**
- The median carries **young palm/banana-type saplings and low shrubs**.
- **Steel pedestrian guard railings** run along the median edge and the
  footpath edge on the arterial.
- Footpath is grey concrete paver slabs; road is dark worn asphalt with
  faint lane markings; bundles of power/telecom cable strung between poles
  on the shop side.
