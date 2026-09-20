# P7-COLLISION: make the world solid (Route A)

Owner files: `src/city.js`, `src/traffic.js`, `src/main.js` ONLY.
Docs: write `docs/COLLISION-PASS.md`. Screenshots: `screenshots/p7-col-*.jpg`.
Read first: `docs/briefs/P0-COMMON.md`, `docs/PLAN-COLLISION-PHYSICS.md`
(ALL of it — it is the analysis this brief implements), then
`src/city.js` (`buildCollisionGrid` ~line 1069, `resolveCollision` ~1136),
`src/walkable.js` (`addSegments`), `src/main.js:229-237` (the wiring), and
`src/traffic.js`.
READ ONLY, do not edit: `src/player.js`, `src/drive.js`, `src/metro.js`,
`src/streets.js`, `src/interior.js` — all owned by other executors. You can
see what they build by walking the scene graph by object name at runtime,
which is this repo's standard cross-file technique.

## Why
The owner asked "what about using collision physics and etc for car and
player?". The analysis found the world is largely hollow. Route A (extend
the existing solver) was chosen over a physics engine because the problems
are missing colliders and a missing Y band, not missing rigid-body dynamics
— an engine would still have to be told about the piers.

Do these in order. Each is independently valuable, so land and verify each
before starting the next, and write it up as you go.

## 1. Piers, columns and poles become solid (do this first)
`buildCollisionGrid` only ever sees `scene.buildings`. The viaduct piers,
station portal columns, streetlights and the 447 relocated poles are built
in metro.js/streets.js and are in NO collision set. In the owner's photos
the piers stand in kerbed islands in the middle of the carriageway — the
most prominent obstacle on the map is currently a ghost you drive through.
- Add an exported helper in city.js, e.g.
  `ingestSceneColliders(root, collision)`, that walks the THREE scene graph
  and turns structural obstacles into wall segments fed through the
  existing `collision.addSegments(segs)` extension point (wired in
  main.js:234 around walkable.addSegments — interiors already use it, so it
  is proven).
- Find them by object NAME and by InstancedMesh instance matrices: metro.js
  builds piers as InstancedMesh (search its `pierPts` meshes — shaft, cap,
  base), and streets.js builds pole/lamp InstancedMeshes. Log what you
  found and how many, and DO NOT hard-code counts.
- Shape: a square of 4 segments around each pier at its real footprint
  (piers are rectangular with a plinth); an octagon or a 4-segment box for
  poles, radius ~0.15 m. Do not make poles so fat that the footpath becomes
  unwalkable.
- Call it from main.js AFTER the metro and streets are built.
- VERIFY BY DRIVING INTO A PIER: the car must stop/deflect, not pass
  through. Screenshot `p7-col-pier.jpg` from the chase camera at the moment
  of contact, and log the car's position before and after so the stop is in
  the record, not just in the picture.

## 2. Height bands, so you can pass UNDER things
Footprint segments are effectively infinite in Y today, so nothing can be
driven or walked under — including the concourse box that spans the road on
portal columns, which buses pass beneath in the owner's photos P2 and R1.
- Give a segment an OPTIONAL `[yMin, yMax]` band, and have
  `resolveCollision` take the mover's Y (or feetY) and skip segments whose
  band excludes it.
- **Backwards compatibility is mandatory**: a segment with no band must
  still collide at every height, so every existing caller — player.js and
  drive.js, which you do NOT own and must not edit — keeps working
  unchanged. Add the Y as an OPTIONAL trailing argument with a default that
  preserves today's behaviour exactly. State in the doc how you guaranteed
  this, and re-verify walking and driving still collide with buildings.
- Give the piers/columns from step 1 sensible bands (a portal column is
  solid from 0 to the box soffit at ~8 m; the box itself above that is not
  something a street-level car can reach anyway).

## 3. Traffic stops being a ghost
343 vehicles and 320 pedestrians run on rails in traffic.js and collide
with nothing, in either direction. You drive through buses; buses drive
through you.
- Agent vs PLAYER CAR: the player's car position/half-extents are reachable
  at runtime (`window.__mirpur` exposes the player and the drive state;
  read it defensively and no-op when not driving). Test only the nearest
  ~20 agents — they are already ordered along routes, so a distance cull is
  cheap. On overlap: push the agent out and transfer some speed.
- Agent vs AGENT ahead on the same route: a car-following term — keep a gap
  to the agent in front, brake rather than interpenetrate, so traffic
  QUEUES at the Mirpur 10 junction the way the owner's photos show.
- Pedestrians must not be walked or driven through either.
- **PERFORMANCE IS THE CONSTRAINT**: this runs every frame for hundreds of
  agents in a browser. No per-frame allocation (traffic.js already follows
  this — keep it), no O(n^2) over all 343 agents. Measure and record the
  per-frame cost of the new code and the HUD fps before and after. If it
  costs more than ~1 ms, cull harder rather than shipping a stutter.

## Do NOT do in this pass
Do not add a physics engine (Rapier or otherwise) — that decision is
explicitly deferred, see the recommendation in
docs/PLAN-COLLISION-PHYSICS.md. Do not add angular/impact dynamics to the
car; drive.js is not yours.

## Verification (mandatory)
Dev server is ALREADY RUNNING at http://localhost:5183 — do not start or
kill one. North scene is the default; `?scene=old` is faster to iterate on,
but take FINAL screenshots on the default. Enter the street at [399,318]
in an 800x450 frame; V or the Drive button to drive; F is fly; quick travel
1 / 2 / 5 / 6.
Hidden-pane rule: rAF does not fire, so after moving call
`window.__mirpur.player.update(0)` then `window.__mirpur.capture()`.
Screenshots, distinct md5s, each read back with the Read tool:
- `p7-col-pier.jpg`     — car stopped against a viaduct pier
- `p7-col-underbox.jpg` — standing or driving UNDER the concourse box
- `p7-col-traffic.jpg`  — car in contact with a traffic vehicle, not
                          inside it
- `p7-col-queue.jpg`    — traffic queued nose-to-tail rather than overlapping
Record HUD draws / triangles / fps before and after, and the measured
per-frame cost of the traffic collision. Write docs/COLLISION-PASS.md AS
YOU GO. Take your own tab with tabs_create, close it with tabs_close.
Do not spawn sub-agents. Do not run git commands. Never claim a collision
you did not observe — log positions, do not just eyeball the picture.
