# Walkable station interiors: engineering design

Advisor brief. The executor implements this; the interior *content* (what the
rooms contain, finishes, gate counts) comes from
`reference/metro/interior/SPEC-INTERIOR.md`.

## The blocker

`src/player.js` pins the walking camera to a constant:

```js
this.position.y = EYE_HEIGHT + bob;   // line ~202
```

There is no floor concept at all. The world is a ground plane at y=0 plus
buildings the player slides around. To walk into a station, up to a concourse
at 8.0 m and onto a platform at 14.5 m, the player needs to stand on surfaces.

Full mesh collision (raycasting every frame against station geometry) is the
obvious answer and the wrong one here: the station is thousands of merged
triangles, the merge is per material, and a BVH dependency plus per-frame
raycasts is a lot of machinery for what is geometrically a handful of flat
slabs and a few inclined planes.

## The design: a walkable-surface registry

Model the walkable world as an explicit, tiny data structure that the station
builder registers as it builds. Two primitive types cover everything:

### 1. Slab
An axis-aligned-in-local-space horizontal rectangle at height `y`.
```
{ kind: 'slab', y, cx, cz, halfW, halfD, rot }   // rot = yaw of the station
```
Point test: rotate the query point into the slab's local frame, then a simple
box test. Used for: street (implicit, y=0), concourse floor, each platform,
stair landings, entrance pavilion floors, the bridge decks.

### 2. Ramp
Same rectangle, but the height varies linearly along its local +Z:
```
{ kind: 'ramp', y0, y1, cx, cz, halfW, halfD, rot }
```
Height at a point = lerp(y0, y1, (localZ + halfD) / (2*halfD)).
Used for: staircases (treated as a smooth ramp; the visible geometry still has
real steps), escalators, and any accessibility slope.

### 3. Portal (lift)
A slab pair plus a trigger volume. Standing inside and pressing E moves the
player to the paired slab's height over ~1.5 s, with the camera easing.

## Support query

```js
supportHeightAt(x, z, currentY) -> number | null
```
Returns the height of the highest walkable surface that is at or below
`currentY + STEP_UP` (0.45 m) and not more than `MAX_DROP` (6 m) below.
Bucket surfaces into a 20 m grid keyed on their bounding box so the query
touches only a handful of candidates. Ground (y=0) is the fallback everywhere
inside the map bounds, so behaviour outside stations is unchanged.

## Player changes (src/player.js)

Replace the pinned height with a light vertical simulation:

- Track `this.feetY` (the surface height the player stands on) and
  `this.vy`.
- Each frame after the horizontal move resolves:
  1. `const s = supportHeightAt(x, z, this.feetY)`
  2. If `s !== null` and `s <= this.feetY + STEP_UP`: snap `feetY` toward `s`
     (lerp fast, ~20/s, so stairs feel smooth rather than stepped), `vy = 0`.
  3. Else apply gravity: `vy -= 9.8 * dt; feetY += vy * dt`, and land when a
     surface is crossed. This makes walking off a platform edge a fall rather
     than a teleport, which is the correct failure mode.
- `camera.y = feetY + EYE_HEIGHT + bob`.
- Keep fly mode exactly as it is; it ignores the registry.

## Interior collision

The existing collision grid only holds building footprints. Add a second set
of wall segments registered by the station builder: concourse perimeter walls
(with door gaps), stair side walls, the gate-line barrier, platform edge
barriers behind the screen doors, and the lift shaft. Reuse
`resolveCollision`'s segment format so `src/city.js` needs no change beyond
accepting extra segments.

Critical: **the player must not be able to walk off the platform onto the
track.** Half-height screen doors are only 1.5 m, so the barrier there is a
collision wall regardless of the visual height.

## Escalators

An escalator is a ramp plus a conveyor: while the player stands on a surface
flagged `moving: true`, add its direction vector times ~0.75 m/s to the
player's position each frame. Direction is the ramp's local +Z (or -Z for a
down escalator). The visible step geometry can animate by scrolling a texture
offset; do not animate real step meshes.

## Ticket gates

Model as a trigger: a thin volume across each gate lane. If the player has not
"tapped in", the flap collision is on. Pressing E at the gate with a ticket
opens it for 2 s. Buying a ticket is a simple interaction at the ticket
vending machine that sets `hasTicket = true`. Keep the whole thing to about
50 lines; it is flavour, not a simulation. Provide a `--nogate` style escape
hatch: pressing E on a closed gate without a ticket prints a HUD hint rather
than hard-blocking, so a player can never get stuck.

## Interaction prompt

A small HUD line ("E: buy ticket", "E: call lift", "E: tap in") shown when the
player is inside a trigger. One shared `interactables` list, nearest-first,
range 2.5 m, dot-product in front of the camera.

## Level of detail

Interiors are expensive and invisible from outside. Build each station's
interior geometry lazily: create it the first time the player comes within
120 m, and keep it thereafter. Two stations is a small enough number that
disposal is unnecessary.

## Acceptance

A player must be able to, without flying and without clipping:
walk from the street, through the entrance, up the escalator or stairs to the
concourse, buy a ticket, pass the gate line, take the stairs or escalator to
the platform, walk the full 180 m of platform, ride the lift back down, and
exit to the street on the opposite side of the road.
