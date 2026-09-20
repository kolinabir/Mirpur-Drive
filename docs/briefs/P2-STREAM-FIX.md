# P2-STREAM-FIX: streaming plateaus on the north scene

Owner file: `src/city.js` ONLY. Docs: append to `docs/STREAMING.md`.
Screenshots: screenshots/p2-streamfix-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/STREAMING.md, docs/MAIN-WIRING.md
("Not done / caveats", the repro), then src/city.js streaming code.

Repro: open http://localhost:5183/?scene=north&debug=1, enter, then via
the hook teleport the player to the Uttara South station
(metro.stations by name; approx x -371, z -3585), call
`updateBuildingLOD(x, z)` 400 times, read getStreamingStats(): built
plateaus at +1 although 46 tile buckets with buildings lie within
BUILD_RADIUS (700 m). Find why: suspects in order (a) a bucket whose
`near` list is empty (all far) or whose build emits no mesh is selected
as nearest-pending every call and never marked built; (b) the pending
scan uses a stale list computed at buildBuildings time; (c) the Chebyshev
distance uses the wrong tile centre for negative coordinates
(Math.floor vs truncation on negative x/z); (d) disposal of the far
tiles re-adds them to pending in a way that starves the scan. Fix it,
make every selected tile end in a terminal state (built or empty), and
make the scan O(tiles) per call at most.
Verify: same repro, built must reach ~35 + 46 within 60 calls; screenshot
p2-streamfix-uttara.jpg from the same pose as p1-main-north-uttara.jpg
(compare: buildings must now surround the station) and
p2-streamfix-start.jpg on the default scene unchanged. Also confirm the
default scene's 1.5 km teleport test still passes. Close your tab.
