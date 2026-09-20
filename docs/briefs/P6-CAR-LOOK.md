# P6-CAR-LOOK: make the car stop looking like a toy

Owner files: `src/drive.js`, `src/models.js`, and `public/models/` ONLY.
Docs: write `docs/CAR-LOOK.md`. Screenshots: `screenshots/p6-car-*.jpg`.
Read first: `docs/briefs/P0-COMMON.md`, `docs/CAR-MODEL-HUNT.md` (ALL of it
— it is the evidence for why this brief exists), `docs/briefs/P4-CAR.md`
(the pass that got us here), then `src/drive.js` and `src/models.js`.

## Why this brief exists
The owner rejected the car outright: "you added an ugly ass looking car!
its run in backward! so urly! can we add a real car!". The advisor then ran
a full CC0 hunt (docs/CAR-MODEL-HUNT.md) and PROVED there is no realistic
CC0 car available: every free no-login source is stylised, and the
"Eclair 50-model CC0 pack" the owner asked for turned out to be a
repackaged Kenney kit whose sedan.glb is byte-identical to the one already
in the repo (md5 5fc2f2353fb3b0963e069f8fa4ef7622).

**So do NOT go looking for another model. The win is in shading and
proportions on the geometry we have.** Three things make the current car
read as a toy, in order of impact:

### 1. There are no reflections (biggest single win)
The body uses a flat baked colormap on a plain material with NO environment
map. A real car is read by the eye almost entirely through its reflections.
- Give the body a `MeshPhysicalMaterial`: `clearcoat: 1.0`,
  `clearcoatRoughness: 0.03`, `metalness: 0.55-0.7`, `roughness: 0.22-0.3`.
- Add an environment map. `RoomEnvironment` + `PMREMGenerator` ships with
  three.js (`three/examples/jsm/environments/RoomEnvironment.js`) so it
  costs no download; or build a tiny gradient-sky cube from the existing
  `src/sky.js` colours if you prefer the scene to match. Either way set it
  on the car materials (`material.envMap`) or on `scene.environment` — if
  you set it scene-wide, CHECK the buildings and metro do not change
  appearance, and if they do, apply it per-material on the car only.
  `renderer.toneMapping = ACESFilmicToneMapping` if it is not already on.
- The Kenney colormap is a tiny palette atlas; keep it for the UV-mapped
  parts but drive the paint colour from the material, not the texture.

### 2. Toy proportions
Kenney bodies are short and tall. Rescale the loaded body so the car is
about **4.5 m long, 1.80 m wide, 1.45 m high**, with the roofline about a
third of total height and wheels of **0.32 m radius** at the corners
(WHEELBASE is already 2.7 m in drive.js — match the wheel pivots to it).
Measure the loaded model's bounding box and derive the scale rather than
hard-coding a magic number, and log the before/after dimensions.

### 3. The windscreen is an opaque light-grey panel
Real glass is dark and reflective: low roughness, high reflectivity, a dark
base colour, and `envMap`. Use `transmission` only if the frame cost is
acceptable — measure it, and fall back to a dark reflective opaque material
if it is not.

## Also fix, from the owner's report
- **"its run in backward"**: verify the car drives nose-first. drive.js
  already applies a 180 deg Y rotation to the extracted body
  (`bodyMesh.rotation.set(0, Math.PI, 0)`, ~drive.js:213) with a comment
  claiming it was confirmed. Re-verify it FROM A SCREENSHOT: drive forward
  and check the headlamps lead and the taillights trail. Derive the
  orientation from the model's own bounding box / mesh names instead of a
  hard-coded flip if you can, and say in the doc how you proved it.
- Wheels must sit ON the ground (no floating, no sinking) and spin the
  correct way for forward motion.

## New models now available (installed by the advisor)
`public/models/car-kit/` now holds: sedan, sedan-sports, hatchback-sports,
suv, suv-luxury, taxi, van, truck, delivery, delivery-flat, and separate
wheel-default / wheel-dark / wheel-truck (2.0 MB total, CC0 Kenney, see
`Kenney-License.txt` and `MODEL_LIST.csv` there). Separate wheels exist so
they can be spun and steered independently of the body — use them.
Pick whichever body reads best as an ordinary Dhaka private car once
re-proportioned and re-shaded; `sedan` is the obvious default.
Keep `public/models/` under 3 MB total.

## Do NOT do in this pass
The traffic fleet (that is the next brief, and it will reuse your
materials), vehicle-vs-vehicle collision, and anything in index.html,
src/minimap.js, src/interior.js, src/walkable.js, src/metro.js,
src/signs.js or src/city.js.

## Verification (mandatory)
Dev server is ALREADY RUNNING at http://localhost:5183 — do not start or
kill one. North scene is the default; `?scene=old` is faster to iterate on.
Enter the street at [399,318] in an 800x450 frame, press V to drive.
Hidden-pane rule: after moving call `window.__mirpur.player.update(0)` then
`window.__mirpur.capture()`.
Capture, distinct md5s, and READ EACH ONE BACK with the Read tool:
- `p6-car-3q.jpg`      — three-quarter view, parked, reflections visible
- `p6-car-front.jpg`   — front: headlamps, glass, wheel contact
- `p6-car-driving.jpg` — driving forward, proving the nose leads
- `p6-car-before-after.jpg` OR a pair, so the owner can see the change
Record HUD draws / triangles / fps before and after, and the model's
bounding box before and after rescaling. Write docs/CAR-LOOK.md AS YOU GO.
Take your own tab with tabs_create, close it with tabs_close. Do not spawn
sub-agents. Do not run git commands. Never claim a look you did not see.
