# P0-E5: drivable car ("Drive" button)

Owner files: NEW `src/drive.js`, and `index.html` (button + CSS + one
script tag). Docs: `docs/DRIVE.md` (create). Screenshots: screenshots/p0-drive-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/REVIEW-2026-09-07.md.

DO NOT edit main.js, player.js, city.js, traffic.js, streets.js, metro.js;
other executors own them. Reach everything through the runtime hook that
main.js exposes once the world is built: `window.__mirpur = { player,
scene, renderer, camera, metro, collision, ... }` (read main.js around
line 181 to see the exact shape; do not edit it). You MAY `import` helpers
from src/city.js (`resolveCollision`) and three.

## Behaviour
- A HUD button "Drive" (and key V) visible after "Enter the street". Press:
  a car spawns 3 m in front of the player on the road, facing the player's
  yaw, and the camera becomes a third-person chase camera (behind and
  above, smoothed). Press V or the button again: exit, the player is placed
  beside the driver door at eye height and walking resumes.
- Controls: W/Up throttle, S/Down brake/reverse, A/D steer, Space handbrake.
  Arcade model: forward speed with accel ~6 m/s^2, max ~22 m/s (80 km/h),
  drag, steering angle scaled down with speed, simple kinematic bicycle.
  Collisions: resolve the car's 4 corner points against building walls with
  `resolveCollision(collision, x, z, 0.9)` and reduce speed on hit. Do not
  drive up the viaduct; the car stays at y=0 (ground).
- Car mesh: low-poly sedan ~4.4 x 1.8 x 1.45 m in the same style as
  `carParts()` in src/traffic.js (read it, do not import or edit it; copy
  the approach): body, cabin, wheels that spin, head/tail lamps. Any
  colour; white or silver is most Dhaka.
- Taking over the camera without editing player.js: while driving, wrap
  `player.update` with a no-op (save the original, restore on exit) and
  drive the camera yourself each frame from a requestAnimationFrame loop
  in drive.js, using `performance.now()` deltas. Keep the player's
  `position` synced to the car so the minimap and HUD distance still work.
- Traffic vehicles are not collidable this pass; note it in docs/DRIVE.md.

## index.html
Add the button inside the existing HUD container (look for id="hud") with
the same visual style as the other HUD chips, plus a line in the start
card's key list: V / Drive. Add `<script type="module" src="/src/drive.js"></script>`
after the main script tag. drive.js must poll for `window.__mirpur` (every
250 ms) and initialise when it exists, so it needs nothing from main.js.

## Verify
Screenshots: p0-drive-spawn.jpg (car just spawned, chase cam), 
p0-drive-moving.jpg (after ~3 s of W, different position), 
p0-drive-exit.jpg (back to walking). Use your own browser tab; drive by
dispatching keydown/keyup KeyboardEvents on `document` from javascript_tool
if the computer tool's key press does not hold keys. Record fps before/after.
