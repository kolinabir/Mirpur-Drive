# P1-E3d: fix the two landing bugs, then verify the whole walk

Owner files: `src/interior.js`, `src/walkable.js` ONLY. Docs: append to
`docs/INTERIOR-PASS.md`. Screenshots: screenshots/p1-int-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/INTERIOR-PASS.md (ALL of it, the
19:40 advisor section has the exact repro and the method), then
src/interior.js and src/walkable.js.

Fix:
1. Perimeter wall gaps centred on each entrance core's LANDING (top of
   stair, local Z of the landing slab), width = landing width, not on
   the street-level foot.
2. Landing railings: collision segments on the three edges of every
   landing that do not touch the concourse (and on the paid-side
   landings at 14.5 m, the edges that do not touch the platform).
3. The null-support hole near (165.7, 604.7): make sure the concourse
   slab and landings overlap by >= 0.5 m everywhere the player can walk.
Verify with the advisor's method (teleport + keys.add('KeyW') +
player.update(1/60) + interior.update(1/60, player) per frame, hidden
pane is fine), logging feetY and position at each stage:
street -> stair D -> landing -> concourse -> "E: buy ticket" (call
interior.interact(player) when the HUD text shows it) -> gate "E: tap in"
-> paid-side stair (156.3, 604.4 region) -> platform (y 14.5) -> walk
100 m along the platform -> try to walk toward the track: must be
blocked -> lift portal (interact) -> down -> exit via entrance A or B ->
street. Also repeat street -> concourse once at Mirpur 11.
Screenshots: BEFORE capture call `renderer.setSize(480, 270)` via the
hook, capture at quality 0.5, then restore `renderer.setSize(innerWidth,
innerHeight)`; the base64 is then short enough to save with Bash. Eight
files p1-int-01..08.jpg, distinct md5s. Close your tab when done. If
tabs_create fails, wait 60 s and retry up to 5 times; the advisor has
freed the pane.
