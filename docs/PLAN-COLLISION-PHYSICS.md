# Collision and physics: what exists, what is missing, what to do
Advisor, 2026-09-07, answering the owner's "what about using collision
physics and etc for car and player?"

## What is actually in the code today

**One shared 2D collision structure**, built in `city.js:1069`
`buildCollisionGrid(scene.buildings)`: every building's CLIPPED footprint
ring is broken into wall segments and bucketed into a spatial hash by
`COLLIDE_CELL`. `resolveCollision(collision, x, z, radius)`
(`city.js:1136`) is a circle-vs-segment push-out, two relaxation passes.

- **Player on foot**: `player.js:246` resolves at `PLAYER_RADIUS` and damps
  velocity when the push was large (walking into a corner). Vertical
  movement is separate: gravity plus the `walkable` registry
  (`walkable.js`) gives `feetY` from slabs/ramps, which is how the station
  interiors work.
- **Car**: `drive.js:747-768` resolves the FOUR CORNERS of the body at
  radius 0.9, pushes out and sheds speed, and raises a camera-shake impulse.
- **Interiors extend the same grid at runtime** through
  `collision.addSegments(segs)`, wired in `main.js:234` around
  `walkable.addSegments`. This is a clean, already-proven extension point:
  new colliders can be added WITHOUT editing city.js.

There is **no physics engine**. No rigid bodies, no mass, no restitution,
no angular response.

## The four real gaps, in order of how much they hurt

### 1. You can drive straight through the metro piers (worst)
The grid is built from `scene.buildings` and nothing else. The viaduct
piers, the station portal columns, the streetlights and the 447 relocated
poles are all built in `metro.js` / `streets.js` and are **not in the
collision set at all**. In the owner's own photos the piers stand in short
kerbed islands in the MIDDLE of the carriageway with traffic flowing round
them — so the single most prominent obstacle on the map is a ghost.
Fix: read the pier/column/pole positions from the scene graph by object
name at startup and feed them in via `collision.addSegments` (a square of
4 segments per pier, an 8-gon for a pole). No metro.js edit needed.

### 2. Traffic is a ghost in both directions
343 vehicles and 320 pedestrians run on rails in `traffic.js`; nothing
collides with anything. You drive through buses, buses drive through you,
and neither the car nor the walking player can be hit. This is the
difference between a diorama and a game.
Fix: a per-agent broadphase against the player car only (agents are already
in route order, so a distance test against the ~20 nearest is enough),
push-out plus speed transfer, and a "brake for the obstacle ahead" term in
the agent update so traffic queues instead of interpenetrating.

### 3. Collision is height-blind
Footprint segments are effectively infinite in Y, so:
- You cannot walk or drive UNDER anything. The concourse box spanning the
  road on portal columns — buses drive through the opening beneath it in
  the owner's photos P2 and R1 — cannot be represented.
- Standing on the platform at 14.5 m, ground-level footprints still block
  you (the interiors work only because they add their own segments).
Fix: give each segment an optional `[yMin, yMax]` band and have
`resolveCollision` take the mover's Y and skip segments outside its band.
Backwards compatible: a segment with no band collides at all heights.

### 4. No impact dynamics on the car
A corner push-out cannot spin the car, cannot transfer momentum, and has no
suspension. You cannot clip a pier and slew, or ride a kerb.

## Two routes, and my recommendation

**Route A: extend the solver we have.** Fixes 1-3 above plus a cheap
angular impulse for 4 (apply the push at the corner's offset from the
centre of mass and convert the moment into yaw rate). No new dependency, no
download, deterministic, and it reuses `collision.addSegments`, which
interiors already prove works.

**Route B: a real physics engine.** Rapier (`@dimforge/rapier3d-compat`,
WASM, ~1 MB) is the right one for the browser — it has a
`DynamicRayCastVehicleController` that is exactly a driving-game car:
suspension, per-wheel friction, weight transfer, proper crashes. Cost: the
download, replacing the bicycle model in drive.js, and — the real cost —
feeding a 55,091-building city in as colliders, which means streaming
colliders in and out within ~150 m of the player, a second streaming system
alongside the tile streaming in city.js.

**RECOMMENDATION: Route A first, and probably only.** Gaps 1-3 are what
make the world feel hollow, and none of them are physics-engine problems —
they are missing colliders, missing agent interaction and a missing Y band.
An engine would fix none of them for free; Rapier still needs to be TOLD
about the piers. Do A, then judge whether the car still feels wrong. If it
does, add Rapier for the CAR AND NEARBY VEHICLES ONLY, with streamed
colliders, and leave the player on foot on the cheap solver — interiors
depend on the walkable registry and there is no reason to pay physics cost
for walking.

## Ownership note
Route A needs `src/city.js` (the Y band + a pier-ingest helper) and
`src/traffic.js` (agent collision), both FREE right now, plus a few lines
in `main.js` (advisor-owned) to feed the piers in at startup. It does NOT
need metro.js or drive.js, which are both owned by running executors.
