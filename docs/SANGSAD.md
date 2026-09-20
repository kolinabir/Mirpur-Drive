# SANGSAD — the P13-C detail pass

Scope: `src/sangsad.js` only, plus this write-up. Followed
`docs/briefs/P13-C-SANGSAD-DETAIL.md`.

## The five live-review defects, and what fixed each one

1. **"One flat dark grey mass"; marble banding invisible; board-form grid
   reads as a panel joint pattern it doesn't have.**
   The concrete texture (`concreteTexture()`) was rebuilt: the vertical
   shuttering-line grain that was competing with the banding is nearly gone
   (opacity 0.09 → 0.035), and the marble stripe is wider, brighter, and
   more frequent (spacing 4.5 m → 3 m, band thickness roughly doubled,
   colour pushed from `#e8e5dd` to `#f1eee5`, base concrete darkened
   slightly to `#a1998c` for contrast). At Manik Mia Avenue distance the
   horizontal banding is now the pattern that wins, not the grid.

2. **Openings read as windows punched in a wall.**
   `openingOutline()` (the old `panelShape` hole logic, pulled out so both
   the screen-wall hole and the new glazing plane can share it) enlarges
   every shape: circles 0.34/0.31 → 0.42/0.38 of bay size, triangles
   0.66/0.72 → 0.78/0.82, slots 0.34/4.2 → 0.42/5.2, with the triangle and
   slot vertical spans also opened up. Kahn's circles now fill most of
   their bay instead of sitting in the middle of one.

3. **Crown reads as a lumpy box, barely separates from the mass.**
   Three changes: the chamber drum now gets its own mesh and material
   (`sangsad:drum`) — the same skin-toned banded concrete as the screen
   walls, but with a texture repeat computed from the drum's own
   circumference/height so the courses land at the right physical spacing
   on a cylinder — instead of sharing the dark recessed-mass material it
   used to disappear into. The clerestory fins are narrower (0.46/0.3 →
   0.36/0.2 of face width) so a dark glazed ring (`sangsad:glazing`,
   modelled as two open cylinders sized to show through the gaps) is
   visible behind them, which is what actually reads as "ring of fins"
   rather than "solid octagonal cap." A glazed slit was also added at the
   collar, between drum and crown.

4. **South plaza is a 250 m dark grey slab, reads as tarmac.**
   Replaced the single `PlaneGeometry` with: a lawn (`sangsad:south-lawn`,
   `#5d7248`) covering the old plaza footprint, a narrower paved ceremonial
   axis (`sangsad:south-axis`, ≤34 m wide) down the middle, and two shallow
   reflecting pools (`sangsad:reflecting-pools`, flat-shaded dark
   teal — no reflection shader, just colour) flanking the axis near the
   podium. The axis and pools are centred on the entrance bay (see #5), not
   the building's overall bounding box, since this plan is not
   axis-aligned and the two centres are ~30 m apart.

5. **No entrance: no portico, no doors, no scale cues.**
   `findEntranceEdge()` picks the bay-scale ring edge with the most
   south-pointing outward normal (not just the edge nearest the bounding
   box's south extent — the polygon's single southernmost point turned out
   to belong to a diagonal corner block that doesn't actually face south,
   so distance-to-south and facing-south are different questions here).
   `entrancePortico()` builds a cantilevered canopy on two piers projecting
   off that bay, plus a dark human-scale (2.6 m) band of doors set into the
   opening's base at the recessed-glazing depth.

## Also added, per the brief's "beyond that" list

- **Deep reveals + recessed glazing.** `openingGlazing()` places a thin
  (0.14 m) dark filled plane, the same shape as each hole, 1.7 m behind the
  screen's outer face — combined with the screen's 1.15 m thickness this
  reads as a real reveal with something behind it, not a decal. At night
  the glazing gets a warm emissive lift through the same
  `setNightIntensity` contract as the rest of the floodlighting, so the big
  Kahn openings read as lit from within after dark.
- **Podium edge.** A raised coping band (`sangsad:podium-coping`) at the
  plinth's edge, built the same way as the parapet cap (a ring-shaped
  `Shape` with a hole, via the new shared `bandShape()` helper).
- **Approach stair at human scale.** 5 battered slabs (≈0.44 m risers) →
  12 steps (≈0.18 m risers, 1.3 m tread), still spanning the width of the
  whole south face on `centreX` rather than being narrowed to one bay.
- **Lake edge + retaining wall.** `lakeWalls()` reads `Cresent Lake` and
  `Shangsad bhaban Lake` straight out of `scene.areas` by name (the same
  way the building rings are read — nothing about their shape is
  invented), and walls their entire traced perimeter with a low
  (1.5 m) retaining wall. The wall segments are also appended to the
  returned `colliders` array, so the lake edge stops the player the same
  way the building does — this needed the array's meaning to widen
  slightly ("Parliament ring colliders" → "Parliament ring + lake-edge
  colliders"), which is noted in the code where the array is built.

## Contract

`buildSangsad(scene)` still returns `{group, colliders, stats,
setNightIntensity}` unchanged in shape. Added fields, none of which
main.js needs to read:
- `stats.openings`, `stats.lakeWallSegments` (new counts).
- `viewpoint`: `{x, y, z, lookAt}`, a south-elevation camera spot on the
  paved axis looking north at the building's centre — offered for whoever
  ends up wiring a flythrough or menu camera; nothing in this file consumes
  it.

## Final triangle count

**10,200 triangles** (`node tools/smoke-sangsad.mjs` output below), up from
~6.8k, well inside the ~40k budget the brief allows.

```
stats {
  ringPoints: 177,
  courts: 14,
  screens: 177,
  openings: 25,
  height: 28.1,
  crownHeight: 44.5,
  lakeWallSegments: 97
} colliders 274
 sangsad:plinth             tris=   704 nan=0 x[1113.9,1278.7] y[0.1,2.2] z[5628.4,5817.3]
 sangsad:podium-coping      tris=  1358 nan=0 x[1113.5,1279.1] y[2.2,2.4] z[5627.9,5817.8]
 sangsad:screen-walls       tris=  2984 nan=0 x[1120.1,1272.0] y[2.2,27.0] z[5635.3,5810.6]
 sangsad:mass               tris=  1582 nan=0 x[1122.6,1269.4] y[2.2,21.5] z[5637.9,5809.3]
 sangsad:drum               tris=    16 nan=0 x[1179.5,1214.5] y[2.2,34.0] z[5698.2,5733.2]
 sangsad:crown              tris=  1500 nan=0 x[1120.1,1272.1] y[27.0,44.2] z[5635.1,5810.7]
 sangsad:glazing            tris=   692 nan=0 x[1123.2,1269.3] y[5.7,44.5] z[5637.7,5775.1]
 sangsad:portico            tris=    36 nan=0 x[1155.7,1169.9] y[0.0,6.5] z[5767.8,5781.6]
 sangsad:doors              tris=    12 nan=0 x[1162.8,1169.6] y[2.2,4.8] z[5767.7,5773.2]
 sangsad:south-lawn         tris=     2 nan=0 x[1075.7,1316.4] y[0.1,0.1] z[5803.0,6053.0]
 sangsad:south-axis         tris=     2 nan=0 x[1148.2,1182.2] y[0.1,0.1] z[5813.0,6053.0]
 sangsad:reflecting-pools   tris=     4 nan=0 x[1105.1,1225.3] y[0.1,0.1] z[5833.0,5879.0]
 sangsad:south-steps        tris=   144 nan=0 x[1105.7,1286.4] y[-0.0,2.2] z[5818.3,5833.9]
 sangsad:lake-wall          tris=  1164 nan=0 x[697.1,1616.1] y[-0.3,1.2] z[5372.5,5833.1]
total triangles 10200 meshes with NaN: 0
```

`npx vite build` also passes clean (see below) — no errors, only the
project's existing pre-existing "chunk > 500 kB" advisory notice, unrelated
to this file.

```
vite v7.3.6 building client environment for production...
transforming...
✓ 34 modules transformed.
✓ built in ~0.9s
```

## What still looks wrong / known follow-ups

- **No satellite heights.** Per `docs/BIJOY-DATA.md`, this extract never
  got a heights pass; the 27 m mass height is still the same
  levels-times-FLOOR_H interpretation the header always documented. Out of
  this file's scope (it's a `build-scene.mjs` / data problem, not a
  geometry one) but it means the whole building could be a storey or two
  off in reality.
- **The entrance bay is a heuristic, not a measured fact.** The real
  Sangsad's principal approach and its actual entrance detailing were not
  copied (no proprietary drawings used, per the header); `findEntranceEdge`
  picks the most south-facing bay-scale run algorithmically. It landed on
  a plausible bay, but "plausible" is the operative word — someone with an
  actual site plan could place this more precisely.
- **The portico is generic massing, not Kahn's actual entrance.** A slab
  canopy on two piers is a scale cue, not a reproduction — deliberately,
  since no measured drawings were used. It reads much better than nothing
  at street distance but won't survive close inspection as "the" entrance.
- **The reflecting pools are flat-coloured planes**, not a reflective
  material — there's no water shader in this project to reach for, so they
  read as dark paving rather than as water when viewed close up or from a
  low angle.
- **The lake retaining wall walls the entire traced perimeter** of both
  lake polygons, not just the sides that border the complex — simpler and
  defensible (it's still real geometry, still real position) but a bit of
  wall now exists on shorelines nowhere near the building.
- **Screen-wall opening arrangement is still purely length-derived** — two
  bays of the same length always get the same treatment, which is the
  same simplification the file already documented; it hasn't gotten more
  faithful, just bigger.
