# P1-E6: cull the extract to the playable radius at data-build time

Owner files: `tools/build-scene.mjs` and the generated `public/scene.json`
(run `npm run data`). Docs: `docs/DATA-CULL.md` (create). NO src/ edits.
Read: docs/briefs/P0-COMMON.md, docs/DECISION-PLAYABLE-AREA.md.

Owner decision: playable area = within 400 m of the metro centreline. Fog
reaches 900 m at most. Anything that can never be seen from inside that
area is dead weight at load time and in draw calls.

In build-scene.mjs, after the metro tracks are collected (~line 452-482)
and BEFORE the scene object is written (~line 609):
- helper `distToMetro(x, z)` over the metro track polylines (bucketed).
- KEEP_RADIUS = 400 + 600 = 1000 m. Drop buildings whose centroid is
  farther than KEEP_RADIUS from the centreline. Tag buildings between
  400 m and 1000 m with `far: 1` (so the runtime can skip rooftop props,
  emissive windows and shadows for them later).
- Roads: drop road ways whose every point is farther than 450 m from the
  centreline (the drivable network must stay complete inside 400 m;
  a road crossing the boundary is kept whole). Areas/waterways/pois/
  signals: same 1000 m rule by centroid.
- Add a `meta.playable = { radius: 400, keepRadius: 1000 }` entry.
- Print before/after counts. Make the radius a CLI flag
  (`--radius 400`) with this default so nothing is hard-coded.
- Run `npm run data`, confirm public/scene.json is valid JSON and smaller,
  confirm the page still loads (the dev server hot-reloads; wait 30 s,
  click Enter the street, screenshot p1-datacull-street.jpg and
  p1-datacull-aerial.jpg (key 4)). The HUD build info line prints the
  building count; record before/after in docs/DATA-CULL.md.
Note: other executors are editing src/ live and taking screenshots; a
scene.json rewrite reloads their tabs once. That is acceptable; do it once,
not repeatedly.
