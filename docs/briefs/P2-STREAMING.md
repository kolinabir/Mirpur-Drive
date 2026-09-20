# P2-STREAMING: build city tiles lazily around the player

Owner file: `src/city.js` ONLY. Docs: `docs/STREAMING.md` (create).
Screenshots: screenshots/p2-stream-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/DECISION-PLAYABLE-AREA.md (map is
growing to ~35k buildings: Mirpur 10 to Uttara South plus west/east arms),
docs/LOD-PASS.md, docs/CORRIDOR-CULL.md, then src/city.js fully.

Goal: the game must start in a few seconds and stay smooth when the
scene has 35k+ buildings. Today buildBuildings() builds every 200 m tile
up front (25 s for 14k buildings).

Design (keep the public API so main.js needs minimal change):
- `buildBuildings(scene, facadeTex, roofTex, emissiveTex, opts)` keeps its
  return shape `{ group, stats, wallMaterial }` but now only BUCKETS
  buildings into tiles (cheap) and builds geometry for tiles within
  `opts.initialRadius` (default 500 m) of `opts.start = {x, z}` (default
  Mirpur 10 station; read `scene.metro.stations` if present, else 0,0).
  When `opts` is absent, behave exactly as today (build everything) so
  the current main.js keeps working until it is updated.
- `updateBuildingLOD(px, pz)` (already exported, called per frame later)
  becomes the streaming driver: each call builds at most ONE pending
  tile whose centre is within BUILD_RADIUS = 700 m (nearest first) and
  disposes tiles farther than DISPOSE_RADIUS = 1100 m (geometry.dispose,
  remove from group; keep the bucket so it can be rebuilt). Keep the
  existing visible-range toggle. Budget: a tile build must not exceed
  ~8 ms; if a tile is bigger, split its work across two calls (walls then
  roofs) or accept one hitch per tile and say so.
- Collision: `buildCollisionGrid(buildings)` must keep working for the
  full building list (it is cheap), so main.js is unaffected.
- Rooftop props, far/near split and corridor clipping stay per tile.
- Expose `getStreamingStats()` -> { built, pending, disposed, lastBuildMs }
  and put it on the returned `stats` too.
Verify with the CURRENT public/scene.json in the browser (own tab, hook):
1. Time from page load to "Enter the street" enabled, before/after
   (read the HUD build info line; note the number).
2. Teleport the player 1.5 km north (player.position), call
   updateBuildingLOD 60 times in a loop, confirm tiles around the new
   position exist and far ones were disposed (getStreamingStats()).
3. Screenshots p2-stream-start.jpg (start view unchanged) and
   p2-stream-north.jpg (after the teleport, buildings present).
Write the one-line main.js change needed (pass opts, and the per-frame
call already required by LOD) into docs/STREAMING.md. Close your tab.
