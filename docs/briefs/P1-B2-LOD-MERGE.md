# P1-B2: far buildings in one mesh per tile (draw-call fix for P1-B)

Owner file: `src/city.js` ONLY. Docs: append to `docs/LOD-PASS.md`.
Screenshots: screenshots/p1-lod2-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/LOD-PASS.md, the "P1-B" entry in
docs/REVIEW-2026-09-07.md.

P1-B split each tile into near wall / near roof / far wall / far roof, so
draw calls rose 697 -> 739 (street) and 129 -> 353 (aerial). Goal: a tile
costs at most 3 draws (near wall, near roof, far combined), and the total
at the start view is BELOW the pre-LOD 697 with the LOD kept.
- Far buildings: merge wall + roof geometry into ONE BufferGeometry per
  tile with ONE non-emissive material. If walls and roofs use different
  textures, put both into the far material as a single atlas or use
  vertex colours for the roof and the facade atlas for walls with a UV
  region; simplest acceptable: far roofs use the facade atlas's plainest
  cell. Tiles entirely far: 1 draw. Tiles entirely near: 2 draws.
- Also check whether near tiles are frustum-culled per mesh (bounding
  spheres computed after merge: call geometry.computeBoundingSphere()).
- Measure renderer.info calls at start / aerial before and after; write
  the table. Screenshots p1-lod2-street.jpg (unchanged look) and
  p1-lod2-aerial.jpg.
Keep the corridor clip, collision grid, updateBuildingLOD export and
winding. Close your tab when done.
