# P11-F — People inside the stations

**Owner (the ONLY file you may edit): `src/traffic.js`.**
Concurrent executors own src/metro.js, src/interior.js, src/main.js,
src/textures.js and src/signs.js this pass — do not touch them, do not
reformat them. Do NOT use the browser preview tools (shared, throttled);
the advisor verifies. Do not commit.

## Why
Owner report: "No people inside the stations; the pedestrian system stops
at street level." Today `buildPedestrians` seeds every agent onto a road
route (`buildRoutes(scene.roads).filter(r => r.rank >= 2)`) at y=0. The
concourse (y=8) and the platforms (y=14.5) are completely empty — you
climb into a brand-new metro station and it is deserted, which reads as
broken rather than quiet.

## What to build
Extend `buildPedestrians` with a second class of agent — **station
agents** — that walk the station decks instead of a road route. Keep them
in the SAME two InstancedMeshes (`bodies`, `heads`) that already exist so
this costs no extra draw calls; just extend the instance count and give
station agents their own update branch.

### Where they walk (all derivable without touching other files)
`buildPedestrians(scene, count, origin)` already receives `scene`;
`scene.metro.stations` gives `{ name, x, z }` per station. You will also
need the station `heading` and the deck dimensions. Import the exported
`METRO` constant object from `./metro.js` — **import only, do not edit
that file** — which gives `CONCOURSE_Y` (8.0), `DECK_Y` (14.5),
`CONCOURSE_W` (27), `CONCOURSE_LEN` (60), `PLATFORM_LEN` (180),
`PLATFORM_W` (5) and `TRACK_CENTRES` (3.9).

Station-local coordinates: X across the spine, Z along it. World position
of a local point is
```
x = st.x + lx*cos(h) + lz*sin(h)
z = st.z - lx*sin(h) + lz*cos(h)
```
where `h` is the station heading. `scene.metro.stations[]` as handed to
`buildPedestrians` may not carry `heading` — if it does not, derive it the
same way metro.js does (nearest segment of the metro centreline in
`scene.metro`), or fall back to 0 and say so in your report rather than
inventing a value.

Three walkable bands per station:
- **Concourse deck**, y = 8.0: local X in [-13.5, 13.5], Z in [-30, 30].
  Keep agents clear of the AFC gate line at local Z = -6 except where they
  cross it, and clear of the TVM bank near local Z = -22, X in [-7, -1].
- **Platform A**, y = 14.5: local X centred on `-(TRACK_CENTRES/2 + 0.1 +
  PLATFORM_W/2)`, half-width `PLATFORM_W/2`, Z in [-90, 90].
- **Platform B**, y = 14.5: same, mirrored to +X.

### Behaviour
- Give each station agent a slow wander along its band's long axis with
  occasional standing pauses — the existing `state`/`timer` machinery in
  the road agents is the right pattern to copy.
- Platform agents should loiter near the platform edge facing the track
  (they are waiting for a train), not conga-line up and down.
- Reuse the existing shirt-colour palette, per-agent `scale`, and the
  walk-bob `phase` so they look like the same population as the street.
- Set each instance's Y from its band, not from 0. This is the actual bug
  to avoid: a station agent rendered at y=0 sits in the road.

### Budget and culling
- Add at most **~40 agents per station**, and only for stations within the
  existing near-radius logic — reuse the `origin`/`MAX_PEDS_NEAR` spirit so
  four stations' worth of crowd does not run every frame regardless of
  where the player is. FPS at Mirpur 10 is ~24-28 today with ~175-242 draw
  calls; do not make it worse.
- Station agents must be skipped entirely by the street-crowd separation
  pass (`separateAgents`) or given their own pass — they are 8-14 m above
  the vehicles and must not interact with traffic, and running them
  through the road grid would be wasted work.
- Do not give them collision against the player; they are scenery.

## Acceptance (the advisor will check live)
1. Standing on the Mirpur 10 concourse (y=8) there are people walking
   around at the right height, feet on the floor, not sunk or floating.
2. Standing on either platform there are people waiting near the edge.
3. No pedestrian appears at y=0 under the station that was meant to be on
   a deck, and street crowds are unchanged.
4. Draw calls unchanged (same two InstancedMeshes); FPS no worse.

When done, append a dated section to `docs/HANDOFF.md` and report back to
me with what you built, the per-station agent count, and anything you
could not derive without editing a file you do not own.
