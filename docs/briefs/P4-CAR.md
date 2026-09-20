# P4-CAR: a proper car — model, sound, and feel

Owner (executor) files: `src/drive.js`, NEW `src/models.js`, NEW
`public/models/` (with `LICENSES.md`), and `index.html` ONLY IF the map
executor (P3-MAP-GTA) has already reported — otherwise leave index.html
alone and put the speedometer inside the existing `#bottombar` via DOM
from drive.js.
Docs: write `docs/CAR-PASS.md`. Screenshots: `screenshots/p4-car-*.jpg`.
Read first: `docs/briefs/P0-COMMON.md`, `docs/PLAN-VEHICLES-PEDS-CAMERA.md`
(workstream A and the browser-constraints section), `docs/DRIVE.md`, then
`src/drive.js` in full.

## Why
Owner, 2026-09-07: "we need add a proper structured car! not like this! a
proper with sound and vibe etc!" and "optimize one! remember is runs on
browser!". The physics in drive.js are fine and must be KEPT — the bicycle
model, ACCEL 6, BRAKE 10, MAX_SPEED 22 m/s, MAX_STEER 0.55, the chase
camera. What is wrong is that the car is ten untextured boxes
(`buildCarMesh()`, drive.js:39), the game is completely silent (there is
no audio anywhere in `src/`), and there is no feedback that you are moving
fast.

## 1. A real car mesh (`src/models.js`, new)
- Add a small glTF loader module: `loadModel(url)` with a promise cache,
  meshopt/Draco support if the asset needs it, and a `disposeAll()`. It
  must be reusable — the traffic fleet (P6) will import the same module,
  so do NOT put loading logic inside drive.js.
- Put the assets in `public/models/` with a `LICENSES.md` in exactly the
  style of `public/textures/LICENSES.md` (source URL, author, licence, and
  the date fetched, per file). **CC0 ONLY** — Kenney's car kit, Quaternius,
  or Poly Pizza CC0 filters. Nothing else ships.
- BUDGET: `public/models/` total under 3 MB. The player car under 300 KB
  and under 6 draw calls with its wheels. If a candidate model is heavier
  than that, decimate it or pick another.
- Load during the existing loader progress bar (main.js calls into drive.js
  lazily today — if the model is not ready when the player presses Drive,
  fall back to the current box mesh for that session rather than stalling
  the frame; say in docs/CAR-PASS.md which path you took).
- The model must keep the same local convention as the current mesh:
  **forward is -Z**, wheels reachable as named pivots so they can spin and
  steer. If the CC0 model's wheels are welded to the body, split them in
  code at load time by bounding box, or keep the procedural wheels and use
  the model for the body only. Say which.

## 2. Sound (the "vibe") — WebAudio, new module or a section of drive.js
- **Engine: synthesized, not sampled.** Oscillator bank (2-3 saw/square
  voices an octave apart) + a filtered noise layer, with detune/frequency
  driven by a simulated RPM = f(speed, gear), a lowpass whose cutoff opens
  with throttle, and gain that dips on gear change. This gives a
  continuously variable note for ~2 KB of code and no licence risk. Add a
  gentle idle when stopped.
- **CC0 samples** for what synthesis does badly: a horn (bind it to a key —
  a Dhaka air-horn is half the atmosphere), tyre skid on handbrake, a thunk
  on entering/leaving the car, and a looping street-ambience bed. Credit
  them in `public/models/LICENSES.md` or a sibling `public/audio/LICENSES.md`.
- **HARD BROWSER RULES** (get these wrong and it is silently mute in
  Chrome):
  - ONE `AudioContext` for the whole app; create/resume it inside a USER
    GESTURE — the "Enter the street" click or the Drive button — never at
    module load.
  - Cap concurrent voices at ~12 and reuse nodes; do not allocate an
    oscillator per frame.
  - Provide a mute toggle and respect it; the owner will be recording video.
- Verify audio by reading `ctx.state === 'running'` and the analyser's RMS
  over a few seconds while accelerating, and paste those numbers into
  docs/CAR-PASS.md. A screenshot cannot prove sound; the numbers can.

## 3. Feel
- Speed-linked FOV: ~62 deg at rest to ~76 deg at MAX_SPEED, smoothed.
- Suspension: pitch on accel/brake, roll in corners, applied to the BODY
  group only, never the wheel pivots (or the wheels will float).
- Wheel spin proportional to speed and steering angle on the front pivots
  (the `wheels` object already exists in drive.js).
- Road-noise camera shake scaled by speed, small enough not to nauseate;
  a stronger bump when a kerb is hit.
- Handbrake: skid marks (decals on the ground, pooled and recycled, hard
  cap ~200) and a dust/tyre-smoke particle puff.
- Working brake lights (the tail material already exists) and indicators.
- A speedometer in the HUD in km/h.

## 4. Do NOT do in this pass
Collision against other vehicles, and the traffic fleet itself — that is
P6-TRAFFIC and it will import your `src/models.js`. Keep the module's API
small and documented at the top of the file so P6 can use it unchanged.

## Verification (mandatory)
Dev server is ALREADY RUNNING at http://localhost:5183 — do not start or
kill one. The NORTH scene is the default (55k buildings, 4 stations);
`?scene=old` gives the small one — use `?scene=old` for iteration speed if
the north load is slow, but take the final screenshots on the default.
Enter the street at [399,318] in an 800x450 frame, then press V (or the
Drive button) to get in the car.
Hidden-pane rule: rAF does not fire, so after moving call
`window.__mirpur.player.update(0)` then `window.__mirpur.capture()`.
Capture, distinct md5s:
- `p4-car-parked.jpg`   — the new car from the chase camera, stationary
- `p4-car-front.jpg`    — a close view of the front (headlamps, wheels)
- `p4-car-speed.jpg`    — at speed, wide FOV visible
- `p4-car-skid.jpg`     — handbrake skid marks on the road
Record in docs/CAR-PASS.md: draw calls / triangles / fps from the HUD
BEFORE and AFTER your change, the model file sizes, the AudioContext state
and RMS numbers, and anything not done. Read every screenshot back with
the Read tool and describe honestly what you see.
Take your own tab with tabs_create, pass that tabId on every call, close it
with tabs_close when done. Do not spawn sub-agents. Do not run git commands.
