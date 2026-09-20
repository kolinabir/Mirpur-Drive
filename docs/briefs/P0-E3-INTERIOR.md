# P0-E3: controls hook, then walkable station interiors

Owner files: `src/player.js`, `src/main.js`, and NEW `src/interior.js`.
You may also add a small `src/walkable.js` if you want the registry
separate. Docs you own: `docs/INTERIOR-PASS.md` (create), `docs/DEBUG-HOOK.md`.
Read first: docs/briefs/P0-COMMON.md, docs/WALKABLE-INTERIOR-DESIGN.md (the
design; follow it), reference/metro/interior/SPEC-INTERIOR.md incl. its
ADVISOR ADDENDUM (content), docs/REVIEW-2026-09-07.md.

## Step 0 (do FIRST, within your first few minutes, other agents wait on it)
In main.js expose `window.__mirpur = { player, scene: scene3, renderer,
camera, metro, collision }` once the world is built, plus
`capture()` that renders one frame and returns
`renderer.domElement.toDataURL('image/jpeg', 0.7)`. In main.js reset
`player.pitch = 0` inside the Digit1/2/3 presets (Digit4 sets -0.62 and it
currently leaks into the others). In player.js add Q/E... no: keep E free
for interactions; add `[` and `]` for pitch down/up and `,` `.` for yaw so
automated review can look around. Write docs/DEBUG-HOOK.md describing it.
Verify with a reload that `window.__mirpur.player` exists. Then continue.

## Step 1: walkable-surface registry + vertical simulation (player.js + new file)
Implement exactly docs/WALKABLE-INTERIOR-DESIGN.md: slab, ramp, portal
kinds; `supportHeightAt(x, z, currentY)` with a 20 m bucket grid; STEP_UP
0.45, MAX_DROP 6; gravity with `feetY`/`vy`; camera y = feetY + EYE_HEIGHT
+ bob; fly mode untouched. Ground y=0 is the implicit fallback. Extra wall
segments: extend the collision object with `addSegments(segs)` on YOUR side
(wrap the grid returned by buildCollisionGrid; do not edit city.js) so
interior walls use the same `[ax,az,bx,bz]` format resolveCollision reads.

## Step 2: station interior content (interior.js)
Build lazily when the player is within 120 m of a station. Read levels from
`METRO` (imported from metro.js: SOFFIT_Y, DECK_Y, CONCOURSE_Y,
PLATFORM_LEN; E2 is adding PLATFORM_W, CANOPY_SPAN, TRACK_CENTRES,
CONCOURSE_W, CONCOURSE_LEN, use them with fallbacks 5, 22, 3.9, 20, 60) and
station pose from `metro.stations[i]` ({name,x,z,heading}; E2 is adding
`entrances[]`, use a fallback of two cores at +/- (CONCOURSE_LEN/2 + 6) along
the heading on the east footpath if absent). Per SPEC-INTERIOR.md:
- entrance core: stair (2.2 m wide, treated as a ramp) beside a 1.0 m
  escalator (ramp flagged moving, 0.75 m/s) from y=0 to the concourse at
  CONCOURSE_Y; landings as slabs
- concourse: floor slab, perimeter walls with door gaps, ticket vending
  machines (interactable "E: buy ticket"), a gate line of 6 lanes with
  flap collision + "E: tap in", the paid-side stairs/escalators up to
  DECK_Y for each platform side, a lift portal concourse<->platform and
  concourse<->street ("E: call lift")
- platforms: slab for each side platform, collision barrier along the PSD
  line (player must never reach the track), full PLATFORM_LEN
- HUD interaction line (nearest interactable within 2.5 m, in front)
Visual finish is secondary to walkability this pass, but use the palette in
SPEC-INTERIOR.md (cream panels, dark grey stone floor, stainless rails).
Register every walkable surface and wall as you build. Keep the whole
gate/ticket logic ~50 lines with the no-stuck escape hatch.

## Verify (the acceptance from the design doc)
Using the hook, script a walk: street -> entrance -> up escalator ->
concourse -> buy ticket -> gate -> up to platform -> walk 100 m -> lift
down -> street on the other side. Save screenshots at each stage:
screenshots/p0-int-01-entrance.jpg ... p0-int-08-exit.jpg, distinct md5s.
Log feetY at each stage in docs/INTERIOR-PASS.md. Also confirm walking
off the platform edge toward the track is blocked, and that street
walking far from stations is unchanged (no fall-through, same fps within
2). Report what is not done.

## Coordination
E2 is rewriting station geometry in metro.js at the same time. Your
registry heights come from METRO constants so they stay aligned; footprints
may drift until E2 finishes. Write any mismatch you see into
docs/INTERIOR-PASS.md under "needs from E2" rather than editing metro.js.
