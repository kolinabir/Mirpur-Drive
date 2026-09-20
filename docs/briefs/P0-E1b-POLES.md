# P0-E1b: no poles in the carriageway (run after E1 finishes)

Owner file: `src/streets.js` ONLY. Docs: append to `docs/ROAD-PASS.md`.
Read: docs/briefs/P0-COMMON.md, docs/ROAD-PASS.md,
docs/OWNER-FEEDBACK-2026-09-07.md item 2.

Streetlights and power poles (buildStreetFurniture, ~line 420) are placed
along OSM road edges. Under the viaduct the carriageway is generated from
the metro centreline (buildMetroCorridorRoad), so OSM-edge poles now stand
in the lanes with cables across the road. Fix:
- Build a distance-to-metro-centreline helper from scene.metro.tracks
  (same approach as city.js `distToCentreline`; do not import city.js).
- Any light or power pole within 14 m of the centreline: move it to the
  corridor footpath edge on its own side (signed distance +/- 13.6 m along
  the local normal), or drop it if the moved spot is inside a building.
  Cables must be re-strung between the moved positions; cables must never
  cross the carriageway under the viaduct (span only along a footpath).
- Also add the corridor's own streetlights: on the viaduct parapet
  (SPEC A8) every 32 m if not already done, and footpath lights every 30 m
  on both sides of the corridor.
Verify: p0-poles-key1.jpg, p0-poles-key2-ground.jpg, p0-poles-under.jpg
(standing in the median looking along): no pole in any lane, no cable
crossing the road under the viaduct. Distinct md5s via capture().
