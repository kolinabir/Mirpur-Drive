# P1-B: level of detail for far buildings + distance tile culling

Owner file: `src/city.js` ONLY. Docs: `docs/LOD-PASS.md` (create).
Screenshots: screenshots/p1-lod-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/DECISION-PLAYABLE-AREA.md,
docs/briefs/P1-PERF-BOUNDARY.md (row P1-B), docs/CORRIDOR-CULL.md (the
clip machinery you must keep intact).

Playable area = within 400 m of the metro centreline. Another executor
(E6) is regenerating public/scene.json with `far: 1` on buildings 400-1000
m out and dropping those beyond 1000 m; it may land during your work.
Do NOT depend on the tag: compute `isFar(b)` at runtime as
"centroid farther than 400 m from the metro centreline" using the
centreline helper already in city.js, and treat `b.far === 1` as the same.

1. Far buildings: no rooftop props, no emissive window texture (use the
   plain facade atlas without the emissive map, or set emissive intensity 0
   for that tile's material), `castShadow = false`, `receiveShadow = false`.
   Bake far buildings into separate tiles/meshes from near ones so the
   material difference costs no extra draw calls per tile beyond +1.
2. Tile visibility: tiles are 200 m (TILE_SIZE). Export
   `updateBuildingLOD(playerX, playerZ)` from city.js that sets
   `tile.visible = distance(tile centre, player) < 750 m` (Chebyshev on
   tile centres is fine). It must be cheap (< 0.1 ms, ~100 tiles). main.js
   is owned by another executor; write in docs/LOD-PASS.md the one line
   they must add to the frame loop, and ALSO self-register a fallback:
   `window.__mirpur` exists after build, so poll for it once (setInterval
   250 ms, clear on success) and patch `player.update` like drive.js does?
   NO: do not monkey-patch. Instead expose the function and log a
   console.warn once if it has not been called after 5 s.
3. Measure with renderer.info at the start view and at the aerial view:
   draw calls and triangles before/after, and fps. Record in
   docs/LOD-PASS.md. Screenshots p1-lod-street.jpg (should look identical
   to before) and p1-lod-aerial.jpg (far buildings flat, no props).
Keep the corridor clip, the collision grid and the winding convention.
