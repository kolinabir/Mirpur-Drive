# Decision pending: playable area and what to cull (advisor, 2026-09-07 15:10)

Owner statement: the final product is PLAYABLE, walk + drive only, no fly
mode. Question: cut buildings not visible from the street?

## Advisor position
1. "Not visible from a street" is nearly an empty set here. 768 road ways
   cover the extract and the car can drive all of them, so almost every
   building fronts some road. The only truly hidden ones are courtyard
   infill behind a continuous street wall, a few hundred at most.
2. Geometry is not the bottleneck. 1.8 M triangles renders at 60 fps on a
   normal GPU. The cost that grew this pass is DRAW CALLS: 246 at the start
   of Pass 0, ~700 now, because the new metro, interior, road-furniture and
   car meshes are separate objects. That is what to attack first.
3. The right cut is by DISTANCE from the playable area, not by visibility:
   - Define the playable area: the corridor plus the side streets within
     ~400 m of the metro centreline (soft boundary: HUD "turn back" and a
     gentle push, no invisible wall in the middle of a road).
   - Drop buildings beyond playable area + fog range (~600 m) completely.
     Estimate: about half of 14,462 buildings go.
   - Keep every building inside, but drop rooftop props and window
     emissive beyond 150 m, and stop casting shadows beyond 120 m.
   - Merge the new meshes back into per-material buckets (target < 300
     draws).
4. Fly mode and the aerial preset must stay in DEV builds behind a
   `?debug` URL flag: executors need them to take verification screenshots.
   Prod build hides the keys and the button.
5. The platform at 14.5 m still overlooks rooftops for ~300 m, so rooftops
   near the two stations must remain detailed.

## DECIDED by owner 15:25: 400 m each side of the metro centreline; do the
advisor plan. Split: E6 (data cull, tools/build-scene.mjs) starts now;
Pass 1 (boundary, LOD, draw-call merge, debug flag) starts when city.js,
main.js and streets.js are free.

## Needs from the owner (answered)
- Confirm the playable boundary distance (400 m each side of the metro?)
  and whether side streets beyond it are simply blocked or faded.
- Then this becomes Pass 1 "perf + boundary" (city.js, main.js, streets.js),
  run AFTER the current Pass 0 executors finish.

## DECIDED by owner 17:55: map extent for the driving game
Owner: "don't add Kazipara/Shewrapara; add the Uttara South side with the
south metro station." Advisor interpretation (state if wrong): the map is
the NORTH-going corridor Mirpur 10 -> Mirpur 11 -> Pallabi -> Uttara
South (four Line 6 stations), plus the west arm Mirpur 10 -> Mirpur 2 ->
Mirpur 1 and the east arm Mirpur 10 -> Mirpur 13/14 -> Kachukhet. No
south arm. Playable band: 400 m each side of those arterials and the
metro. Estimated 30-40k buildings, so the city must be built lazily by
tile (P2-STREAMING) before the new data can replace scene.json.
Data work (P2-E8) writes public/scene-north.json and does NOT replace
public/scene.json until streaming exists, so running executors are safe.
