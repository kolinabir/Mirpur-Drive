# P0-E4b: clip building footprints at the corridor edge instead of culling

Owner file: `src/city.js` ONLY. Docs: append to `docs/CORRIDOR-CULL.md`.
Read: docs/briefs/P0-COMMON.md, docs/CORRIDOR-CULL.md,
docs/OWNER-FEEDBACK-2026-09-07.md item 1.

The owner saw bare lots where E4 culled whole buildings. Replace the cull
with a clip so the shop wall stays continuous on the footpath:
- CARRIAGEWAY_HALF = 12.5 m. For each building whose footprint has a vertex
  within, say, 20 m of the centreline: find the nearest centreline segment
  to the building centroid, take its unit tangent t and normal n, and the
  signed distance of the centroid, side = sign. Clip the polygon
  (Sutherland-Hodgman against a single half-plane) so that it keeps only
  the region with signed distance from the centreline >= CARRIAGEWAY_HALF
  on the building's side. Buildings straddling the centreline (vertices on
  both sides) or with remaining area < 15 m^2 are dropped.
- The clipped ring must stay a valid CCW/CW ring in the same [x0,z0,x1,z1..]
  flat format so extrusion, UV baking, rooftop props and the collision grid
  all work unchanged. Apply the same clipped rings in buildCollisionGrid
  (pass `scene` explicitly; do not rely on the warmed index).
- Log counts: clipped N, dropped M.
Verify: screenshots p0-clip-key1.jpg, p0-clip-key2-ground.jpg, and one
looking across the road at the shop wall from the far footpath
(p0-clip-shopwall.jpg): continuous building fronts at the footpath edge,
nothing under the girder. Distinct md5s, use the capture() trick.
