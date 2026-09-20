# P0-E4: no buildings under the viaduct

Owner file: `src/city.js` ONLY. Docs: `docs/CORRIDOR-CULL.md` (create).
Read: docs/briefs/P0-COMMON.md, reference/metro/OWNER-PHOTOS-2026-09-07.md
(owner correction 1), docs/REVIEW-2026-09-07.md.

Measured from public/scene.json: 23 building footprints have a vertex
within 10 m of the metro centreline (scene.metro.tracks[*].pts, [x,z]
pairs), 86 within 14 m. The real road under the viaduct is ~24 m of
carriageway plus footpaths, so nothing may stand within ~13 m of the
centreline. In `buildBuildings(scene, ...)` (src/city.js ~line 329):
1. Build a distance-to-polyline helper over all track points (139 pts,
   cheap; bucket by 100 m if you like).
2. Skip any building whose footprint has a vertex within CORRIDOR_HALF
   = 13 m of the centreline, OR whose centroid is within 16 m. Count them
   and console.info the count. Do the same skip in `buildCollisionGrid`
   input (collision is built from scene.buildings in main.js; expose the
   filtered list as `scene.buildings` being replaced in place is NOT
   allowed; instead export `isInCorridor(b)` and apply it inside
   buildCollisionGrid too so walls of culled buildings do not block).
3. Do not touch the stations' own footprints (they are not in
   scene.buildings).
Verify: start view and key 1 / key 2 screenshots (screenshots/
p0-corridor-*.jpg) show open road on both sides of the viaduct with no
building under or against the girder; write counts and screenshots into
docs/CORRIDOR-CULL.md.
