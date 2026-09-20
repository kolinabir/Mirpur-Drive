# P5-TPS: third-person view on foot

Owner (executor) files: `src/player.js` and a NEW `src/avatar.js` ONLY.
Docs: write `docs/TPS-PASS.md`. Screenshots: `screenshots/p5-tps-*.jpg`.
Read first: `docs/briefs/P0-COMMON.md`, `docs/PLAN-VEHICLES-PEDS-CAMERA.md`
(workstream B), then `src/player.js` in full and the chase-camera block at
the top of `src/drive.js` (CHASE_DIST / CHASE_HEIGHT / CHASE_LOOK_HEIGHT /
CHASE_SMOOTH, and how the loop applies them) — you are reusing that idea,
not that file. `src/drive.js` is NOT yours.

## Why
Owner, 2026-09-07: "also 3rd person view as well!". The CAR already has a
third-person chase camera. On foot the camera IS the player: player.js
drives `camera.position` directly and no avatar mesh exists anywhere in
the project.

## What to build
1. **An avatar** (`src/avatar.js`): a visible player figure, hidden in
   first person, shown in third. Either one small CC0 rigged glTF or a
   procedural figure in the same style as the pedestrians in
   `src/traffic.js:371` (capsule torso, sphere head, plus separate legs and
   arms so it can be animated). Budget: 1-3 draw calls, under 2k triangles.
   It must sit on `player.feetY`, not on a constant, so it stands correctly
   on the station stairs, landings and platform that `src/interior.js`
   provides.
2. **Walk animation**: a simple procedural leg/arm swing driven by
   horizontal speed and a phase accumulator. No skinning needed. It should
   idle when stopped and speed up when running (Shift).
3. **The camera boom**, the part that decides whether this feels good:
   - Pivot at the player's shoulders, default ~3.5 m back and ~1.7 m up,
     using the same spring smoothing idea as drive.js's chase camera.
   - **Raycast the boom against the collision geometry every frame and pull
     the camera in on a hit**, with a small offset so it never sits inside
     a wall. Without this it is broken the moment the player walks into a
     station or between two buildings, which is most of this map. Use the
     collision grid the player already has plus `window.__mirpur.walkable` /
     `interior` surfaces if they help; do not edit those files.
   - Movement stays camera-relative; the avatar turns smoothly toward the
     direction of travel rather than snapping.
   - Mouse-look orbits the boom. Keep working without pointer lock (the
     automated browser has none) — `player.yaw`/`player.pitch` set from the
     debug hook must still drive it.
4. **The mode switch**: `V` is already taken by Drive. Pick a free key
   (suggestion: `P`, or `C` if it is not bound), cycle first-person ->
   third-person, remember the choice in localStorage, and emit the existing
   `modechange` event so the HUD label can show it. Announce the key in
   docs/TPS-PASS.md so the advisor can add it to the help panel (index.html
   is NOT yours).
5. First person must remain the default and must be completely unchanged
   when selected — this is an addition, not a replacement.

## Verification (mandatory)
Dev server is ALREADY RUNNING at http://localhost:5183; do not start or kill
one. Enter the street at [399,318] in an 800x450 frame.
Hidden-pane rule: after moving call `window.__mirpur.player.update(0)` then
`window.__mirpur.capture()`.
Capture, distinct md5s:
- `p5-tps-street.jpg`   — third person on the street, avatar visible
- `p5-tps-walking.jpg`  — mid-stride, to show the walk cycle
- `p5-tps-wall.jpg`     — backed up against a building wall: the camera
  must have pulled IN, not gone through it
- `p5-tps-stairs.jpg`   — on a station entrance stair (interior.js), avatar
  standing correctly on the sloped surface, not floating or sunk
- `p5-tps-first.jpg`    — first person after switching back, unchanged
Record fps / draws / triangles before and after. Read every screenshot back
with the Read tool and describe honestly what you see; if the camera clips
a wall, say so rather than reporting success.
Take your own tab with tabs_create, close it with tabs_close. Do not spawn
sub-agents. Do not run git commands.
