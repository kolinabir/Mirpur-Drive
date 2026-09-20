# Owner feedback from live play, 2026-09-07 ~14:50 (mid Pass 0)

Owner screenshots (in chat, not on disk) showed:
1. **Buildings missing along the corridor.** E4's cull removed every building
   with ANY vertex within 13 m of the metro centreline, so buildings that only
   clip into the carriageway are gone and their lots show as bare sand. The
   real street has a continuous shop wall on the footpath. Fix: CLIP the
   footprint at the carriageway edge instead of culling (P0-E4b, city.js).
2. **Street lights and power poles standing in the carriageway** under and
   beside the viaduct, with cables strung across the road. Cause: poles are
   placed along the OSM road-edge, but the carriageway under the viaduct was
   rebuilt on the metro centreline, so the OSM edge now falls in the lanes.
   Fix in streets.js: for any pole within 14 m of the metro centreline,
   snap it to the corridor footpath edge (centreline +/- 13.5 m) or drop it
   (P0-E1b, after E1 finishes; streets.js is E1's).
3. Also seen: traffic vehicles on the footpath near the corridor (traffic
   routes still follow the OSM road; queue for the traffic pass).
