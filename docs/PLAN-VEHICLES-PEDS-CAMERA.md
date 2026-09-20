# Plan: proper car, traffic, pedestrians, third-person camera
Advisor, 2026-09-07 (session 3), after the owner asked for "a proper
structured car! not like this! a proper with sound and vibe etc", better
"other vehicles and pedestrians", "3rd person view as well", and
"optimize one! remember is runs on browser!"

## What actually exists today (read from the code, not from memory)

| Thing | Where | State |
|---|---|---|
| Player car | `src/drive.js:39` `buildCarMesh()` | 6 boxes + 4 cylinders. Sharp-edged, one flat colour, ~10 draw calls. Bicycle-model physics (ACCEL 6, MAX_SPEED 22 m/s, MAX_STEER 0.55) that is actually decent. No suspension, no body roll, no skid, no sound. |
| Chase camera | `src/drive.js:30-33` | ALREADY THIRD-PERSON while driving: CHASE_DIST 7.5 m, CHASE_HEIGHT 3.2 m, spring smoothing 5.5. So "3rd person" is only missing ON FOOT. |
| On-foot camera | `src/player.js` | Strictly first-person; the camera IS the player. No avatar mesh exists anywhere in the project. |
| Traffic | `src/traffic.js:14-19` | 343 agents: 150 rickshaw, 70 bike, 60 CNG, 45 car, 18 bus. Instanced box "parts" per type, driven along OSM polylines. Wheels do not turn, nothing brakes, nothing yields at junctions, nothing collides with the player's car, nothing sounds. |
| Pedestrians | `src/traffic.js:371` | 320 instanced capsule+sphere pairs sliding along road centrelines. No legs, no walk cycle, no crowding at the station. |
| Audio | nowhere | `grep` for AudioListener/Audio/howler in `src/` returns NOTHING. The project is silent. |

## The budget problem, first, because it decides the order

At the street view the frame is **691 draw calls / 0.96 M triangles**, and
`docs/DRAWCALLS.md` shows **metro.js alone is 472 of them** — 63% of the
frame for one structure. There is no room to add a vehicle fleet and a
crowd on top of that. `docs/briefs/P1-C-DRAWS-METRO.md` (merge metro into
world-space-UV buckets) is already written and metro.js is free. **It runs
first, or in parallel with the car work, and it should get metro from ~472
to well under 100.** That is where the budget for everything below comes
from. Target after all of this: **under 400 draws, under 1.2 M triangles,
60 fps on a normal laptop GPU.**

## Workstream A — a proper car (drive.js + a new src/models.js)
The gap is not physics, it is the mesh, the sound and the feedback.

1. **Mesh.** Stop hand-building boxes. Add `src/models.js`: a GLTFLoader +
   cache, and a `public/models/` folder with CC0 glTF vehicles (Kenney car
   kit, Quaternius, Poly Pizza — all CC0; credit them in a LICENSES.md the
   same way `public/textures/LICENSES.md` works). One 150-300 KB glb is a
   1-2 draw-call car that looks a hundred times better than ten boxes.
   Dhaka-specific shapes CC0 kits will not have (the green CNG auto, the
   cycle rickshaw, the red BRTC double-decker) stay procedural but get
   properly modelled with bevels and a real cab, not slabs.
2. **Sound, and this is the "vibe".** WebAudio, no downloads for the
   engine: a small oscillator bank (2-3 saw/square voices an octave apart)
   plus filtered noise, with playbackRate/detune driven by simulated RPM
   (speed / gear ratio), a lowpass that opens with throttle, and a subtle
   off-throttle rumble. That gives a continuously variable engine note for
   ~2 KB of code and no licensing risk. CC0 SAMPLES on top for: horn (a
   Dhaka air-horn is half the atmosphere), tyre skid, door/enter thunk,
   and a looping street-ambience bed (traffic hum, crows, distant horns)
   that ducks when you are inside a station. **Browser constraint: audio
   must be created/resumed inside a user gesture** — hook the AudioContext
   resume to the "Enter the street" click and the Drive button, never at
   module load, or Chrome silently blocks it.
3. **Feel.** Speed-linked camera FOV (say 62 -> 76 deg at top speed),
   suspension: pitch on accel/brake and roll in corners applied to the body
   group only (not the wheels), wheel spin + steering angle on the existing
   `wheels` pivots, a small road-noise camera shake scaled by speed,
   tyre-smoke/dust particles and decal skid marks on handbrake, working
   brake lights and indicators, and a speedometer on the HUD.
4. **Interaction.** Kerb bump, and actual collision against buildings and
   other vehicles instead of sliding.

## Workstream B — third-person on foot (player.js + a new avatar)
The car already has a chase cam; reuse its spring. Needs:
- A player avatar mesh (one CC0 rigged glTF, or a simple procedural figure
  matching the pedestrian style) — 1-2 draw calls, hidden in first person.
- A camera boom: pivot at the player's shoulders, ~3.5 m back, 1.7 m up,
  with a **raycast against the collision grid so the camera does not go
  through walls** (pull the boom in on a hit). This is the part that always
  gets skipped and always looks broken indoors — the station interiors make
  it mandatory.
- A view-mode cycle (proposal: `V` already toggles drive, so use a
  dedicated key) that switches first-person / third-person, and remembers
  the choice. In third person, movement is camera-relative and the avatar
  turns toward the direction of travel.
- Cheap: no walk-cycle skinning needed at first — the same procedural
  leg/arm swing planned for pedestrians in workstream D drives the avatar.

## Workstream C — vehicles that behave (traffic.js)
Visual and behavioural, in that order of visibility:
- Swap the box prototypes for the glTF fleet from workstream A, with TWO
  LODs per type (near mesh, far low-poly) so a bus 400 m away is not the
  same 800 triangles. Keep everything instanced, one InstancedMesh per
  (type, LOD) — the fleet must not add more than ~20 draw calls total.
- Wheels turn, buses lean, rickshaw pedals move with speed.
- **Behaviour**: a per-route car-following model (keep a gap to the agent
  ahead, brake, stop), yielding at junctions, stopping for the player's
  car, occasional horn from nearby agents, headlights on at dusk (night.js
  already exists), and vehicles that actually queue at the Mirpur 10
  junction the way the owner's photos show.
- Positional audio for the nearest ~8 vehicles only, with a hard voice cap;
  everything else is covered by the ambience bed.
- Density scaled to the playable band and the new 4.2 km map: agents that
  drift beyond ~400 m of the player get recycled onto a route near them,
  so 343 agents always means 343 agents *near the player*, not spread over
  4 km of empty road.

## Workstream D — pedestrians that walk (traffic.js)
- Give the near ~60 pedestrians a 5-part procedural rig (torso, 2 legs,
  2 arms) animated in a shader from a per-instance phase + speed
  attribute — a walk cycle with zero CPU cost per frame and still ONE draw
  call per part. Beyond ~80 m keep the current capsule, beyond ~200 m drop
  to a billboard impostor or cull entirely.
- Put them where people actually are in the owner's photos: dense on the
  footpaths, queueing at the station entrances and the TVMs, crossing at
  the junction, hawkers standing still under the blue tarpaulins. Right now
  they walk down the middle of roads, which reads as wrong immediately.
- Clothing variety by per-instance colour (already there for shirts; add
  lungi/sari/shalwar silhouettes by scaling the leg parts).

## Recommended order
1. **P1-C metro draw-call merge** (brief already written, metro.js free) —
   frees the frame budget. Nothing else here is safe until this lands.
2. **A: the car** — model + WebAudio engine + feel. Biggest visible win
   for the owner's actual complaint, and it builds `src/models.js`, which
   C then reuses.
3. **B: third-person on foot** — small, self-contained, high impact.
4. **C: the traffic fleet + behaviour** — depends on A's model pipeline.
5. **D: pedestrians** — last because it is the most GPU-sensitive and
   benefits from whatever budget is left.

## Browser-specific constraints to hold everyone to
- Audio only after a user gesture; one AudioContext for the whole app; hard
  voice cap (~12 concurrent) or Chrome starts stuttering.
- Every added asset is a download: keep `public/models/` under ~3 MB total,
  Draco- or meshopt-compress the glbs, and load them during the existing
  ~25 s build progress bar, not lazily mid-drive.
- No per-frame allocation in `update()` — reuse vectors/matrices. This is
  already the pattern in traffic.js; keep it.
- Never let any of this run on the main thread longer than a frame: build
  meshes during the loader, not on first sighting.
- Test target stays the in-app browser HUD (fps, draws, tris), and every
  workstream reports those three numbers before and after.
