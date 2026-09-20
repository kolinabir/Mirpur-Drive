# Road-frontage cull (Pass 6b)

Owner: `tools/build-scene.mjs` (+ regenerated `public/scene.json` and
`public/scene-north.json`). 2026-09-07. No `src/` edits.

Owner ask: "we don't need to add builds which aren't close or viewable from
the road — we can remove those."

## Rule

After the existing playable-radius cull (Pass 6), a building is kept if
**either**:

- any footprint **vertex** is within `--road-front` metres (default **30**)
  of any **kept** road centreline — vertex, not centroid, so a long block
  that fronts a road at one end stays whole; or
- it is at least `--road-front-tall` metres tall (default **25**), so
  anything that would show over the front row from the street still stands.

Everything else is deep-block infill — sheds and rooftops buried behind the
front row with no mapped road, alley or footpath near them — and is dropped
at data-build time.

Both flags take `0` to disable (`--road-front 0` skips the pass entirely;
`--road-front-tall 0` drops the height exemption).

Why "kept roads": the pass runs **after** Pass 6, so it measures against the
road network that actually survives into the scene, not against roads the
radius cull already removed. All road classes count as frontage, footways
and paths included (rank 0-5) — the player walks those too. In practice rank
makes almost no difference here: 369 of the 436 roads in `scene.json` are
rank 2.

## Why 30 m / 25 m

Nearest-vertex-to-road distance across `scene.json`'s 14,453 buildings is
sharply bimodal — p50 = 12.5 m (the front row), then a long tail to 332 m
(blocks with no mapped interior access at all):

| threshold | buildings beyond it |
|----------:|--------------------:|
| 15 m | 6,849 (47.4%) |
| 20 m | 6,189 (42.8%) |
| **30 m** | **5,219 (36.1%)** |
| 40 m | 4,508 (31.2%) |
| 50 m | 3,881 (26.9%) |

30 m sits past the front row and its rear yard without eating into the
second row that is still visible down cross-streets. The height exemption is
cheap insurance: nothing in the extract is over 34.6 m, so `>= 25 m` rescues
only 202 buildings in `scene.json` (5,219 -> 5,017 dropped) and 1,671 in
`scene-north.json`, but those are exactly the ones that would have left holes
in the skyline.

## Counts

`public/scene.json` (`npm run data`, default flags):

```
Culling to playable radius 400 m (keep radius 1000 m)...
  buildings: 14462 -> 14453 (7665 tagged far:1)
  roads:     768 -> 436
Road-frontage cull: keeping buildings within 30 m of a road (or >= 25 m tall), 1734 road segments...
  buildings: 14453 -> 9436 (5017 dropped, 202 kept by the height exemption)
```

1.95 MB -> **1.33 MB** (-32%).

`public/scene-north.json` — the **default** map (`src/main.js:133`), rebuilt
with the same command as docs/NORTH-DATA.md section 6:

```
Culling to playable radius 400 m (keep radius 1000 m)...
  buildings: 87698 -> 55091 (34390 tagged far:1)
Road-frontage cull: keeping buildings within 30 m of a road (or >= 25 m tall), 7857 road segments...
  buildings: 55091 -> 30333 (24758 dropped, 1671 kept by the height exemption)
```

7.46 MB -> **4.38 MB** (-41%).

## Measured effect (A/B in the live build)

Same session, same machine, same viewpoints, north scene rebuilt once with
`--road-front 0` and once with the default, reloading between. Draw calls and
triangles come from `renderer.info.render`; ms/frame is 30 forced
`renderer.render` calls with a `gl.finish()` either side (rAF does not run
while the Browser pane is hidden, so wall-clock fps was not measurable for
both variants at a matching canvas size — the ms figures are **not**
comparable between the two runs and are omitted).

| viewpoint | draw calls (no cull -> cull) | triangles |
|---|---:|---:|
| Paris Road, street level (520, -4) | 407 -> 405 | 720k -> 708k |
| Under the viaduct, Mirpur 10 (149, 560) | 204 -> 168 (-18%) | 697k -> 642k |
| Aerial over the corridor (150, 260, 750) | 148 -> 119 (-20%) | 702k -> 652k |

Page load to `window.__mirpur` ready (single sample each, cold-ish reload):
**6.32 s -> 4.45 s** (-30%).

So the honest summary: the big, reliable wins are **payload (-41%) and load
time (-30%)**; the per-frame win is real but modest (-18-20% draw calls on
the open views, ~flat in a dense street canyon) because `src/city.js` already
merges buildings per tile and streams by distance, so the culled infill was
mostly riding along in tiles that were being drawn anyway.

## Verification

- `npm run data` and the north build command both ran clean and produced
  valid JSON (`JSON.parse` in Node; `meta.playable.roadFront = 30`,
  `roadFrontTall = 25` present in both).
- Street-level screenshot on Paris Road (x=520.4, z=-4.3, yaw 1.73, walk
  mode) before and after the cull: **shopfront frontage is continuous on both
  sides, no bare lots or gaps**, and the two frames are visually
  indistinguishable — which is the point.
- Under-viaduct view at Mirpur 10 and an aerial at 260 m: city still reads as
  dense; block interiors thin out from the air but no skyline holes.

## Not done / caveats

- Screenshots were taken through the Browser pane (`computer:screenshot`) and
  are in the session transcript, **not written to `screenshots/`** — the pane
  ran hidden for part of the session and `capture()`'s base64 could not be
  written to disk from the page. Reproduce with the viewpoints above.
- The minimap (`src/minimap.js`) draws from `scene.buildings`, so block
  interiors are now sparser on the map as well as in the world. Looks fine at
  minimap scale; if the full map (`M`) ever wants the complete footprint set
  it would need its own uncculled source.
- Rooftop props, signs and POIs attached to dropped buildings go with them
  (`pois` is a separate node array and is not touched by this pass, so a POI
  node deep inside a block can now sit next to no building). Not observed as
  a visible problem, but it is the obvious place for one.
- Pre-existing, unrelated: `renderer.render` throws
  `Cannot read properties of undefined (reading 'value')` every frame from
  `main.js:380/382` (already noted at the end of docs/CORRIDOR-CULL.md);
  `capture()` swallows it. Untouched here.
- No `src/` file was edited and nothing was committed.
