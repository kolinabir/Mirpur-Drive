# Interior pass verification (E3b, resumed from E3)

## Per-frame renderer error — triage (done first, per P0-E3b-INTERIOR-RESUME.md)

Culprit found (not in an owned file — reporting only, guard already exists):

`src/night.js:233`
```js
signMaterial.emissiveMap = signMaterial.map;
```
sets `emissiveMap` on an already-compiled `MeshStandardMaterial` without also
setting `signMaterial.needsUpdate = true`. three.js caches a shader program
per material the first time it's rendered; that first compile happened
before `emissiveMap` was set, so the cached program's uniform table has no
`emissiveMap` entry. Every subsequent `renderer.render()` call walks into
`refreshUniformsCommon` (three.js internals, `WebGLRenderer.js`), sees
`material.emissiveMap` truthy, and does `uniforms.emissiveMap.value = ...`
against the stale uniform table, where `uniforms.emissiveMap` is `undefined`
→ `TypeError: Cannot read properties of undefined (reading 'value')`.

Confirmed live via `window.__mirpur.capture()` with `console.error`
temporarily intercepted; full captured stack:
```
TypeError: Cannot read properties of undefined (reading 'value')
    at refreshUniformsCommon (chunk-IT3TP6RZ.js:39484:25)
    at Object.refreshMaterialUniforms (chunk-IT3TP6RZ.js:39437:7)
    at setProgram (chunk-IT3TP6RZ.js:41025:19)
    at WebGLRenderer.renderBufferDirect (chunk-IT3TP6RZ.js:40317:23)
    at renderObject (chunk-IT3TP6RZ.js:40762:15)
    at renderObjects (chunk-IT3TP6RZ.js:40744:11)
    at renderScene (chunk-IT3TP6RZ.js:40660:42)
    at WebGLRenderer.render (chunk-IT3TP6RZ.js:40569:9)
    at Object.capture (src/main.js:190:18)
```
Checked `signMaterial`/`findSignMaterial` and the metro-glow materials in
`src/night.js` (lines ~228-240): only the shop-sign material assigns a new
map-family property (`emissiveMap`) after construction; the metro-glow
materials only touch `emissive`/`emissiveIntensity`, which don't change the
program's `#define`s and are not the cause.

**For E2/E1/whoever owns night.js**: add `signMaterial.needsUpdate = true;`
right after `signMaterial.emissiveMap = signMaterial.map;` at
`src/night.js:233`, or set `emissiveMap` before the material's first render
(e.g. at construction time in facades.js) instead of mutating it later.

**What I did about it (player/interior side, owned files)**: nothing needed
— `src/main.js`'s `frame()` (lines 357-364) already wraps
`renderer.render(scene3, camera)` in try/catch and logs once via
`frame._loggedRenderError`, so the rAF loop and `capture()` survive the
throw and player/interior state stayed testable all pass. This guard was
already present when I picked up the branch (per E3b's resume brief); I
verified it is still doing its job and left it as-is (no edit needed).

## Bug found and fixed in `src/interior.js` (owned file): entrance-core landings

`buildCore()` (used for both the entrance stair/escalator cores and the
paid-side platform-access cores) registers two landing slabs at the top and
bottom of each ramp. The Z-offset formula had the `sign` multiplied onto the
wrong term, putting each landing at the ramp's *other* end:

```js
// before (wrong): loY landed near the ramp's HIGH end, hiY near the LOW end
slabLocal(walkable, station, loY, coreX, centerZ - sign * (halfD + 1), 2.3, 1.2);
slabLocal(walkable, station, hiY, coreX, centerZ + sign * (halfD + 1), 2.3, 1.2);
```

Verified live for the Mirpur 10 south entrance (`sign: -1`): the ramp's own
`y0`/`y1` (from `rampLocal`) put street level (0) at local Z=-43 and
concourse level (8) at Z=-29, but the landing formula placed the "hiY" (8)
slab at Z=-44 (past the street end) and the "loY" (0) slab at Z=-28 (past
the concourse end) — both landings sat outside the ramp's own footprint,
roughly 15-16 m from where they should connect.

Fixed at `src/interior.js:99-106` by keying the landing offset off the
ramp's own `y0`/`y1` (which already fold in `sign`) with a **fixed** sign,
matching `rampLocal`'s "y0 at local -Z, y1 at local +Z" convention:

```js
slabLocal(walkable, station, y0, coreX, centerZ - (halfD + 1), 6, 1.2);
slabLocal(walkable, station, y1, coreX, centerZ + (halfD + 1), 6, 1.2);
```

Also widened the landing `halfW` from 2.3 to 6 m. `coreX` (`CONCOURSE_W/2 +
4` = 14 m local) sits 4 m outboard of the concourse floor's own edge
(`CONCOURSE_W/2` = 10 m); a 2.3 m half-width landing's inner edge only
reached to `coreX - 2.3` = 11.7 m, an unbridged **1.7 m gap** short of the
concourse slab. A scripted walk that reached the landing (feetY≈7.6-8) and
then continued toward the concourse fell straight through that gap to
`feetY 0` (ground fallback) every time, both before and after only the
Z-offset fix. 6 m half-width gives the landing an inner edge at
`coreX - 6` = 8 m, ~2 m *inside* the concourse edge, closing the gap with
margin. Re-verified after the width fix: walking street → escalator base →
mid-ramp → landing → 2 m onto the concourse floor now holds a continuous
support chain (see feetY log below). The same widening also affects the
paid-side platform-access cores (`coreX = ±6`) — checked their landings
still land inside both the concourse and platform slab footprints with the
wider half-width (no regression there; those cores already had margin).

## A real building blocks the south entrance's concourse-side landing

Independent of the above: even after the landing fix, walking sideways from
the (now-correct) landing into the concourse at local (14.55, -28) is
physically blocked — the player's (x,z) does not move at all across an 8+8+10s
scripted push attempt. Traced via `collision.grid`: the closest registered
collision segment is a building-footprint corner (two segments meeting at
world ≈(155.61, 561.98), the corner's other legs running to ≈(166.56,
559.12) and ≈(151.10, 544.06)) sitting **0.06-0.4 m** from the landing —
i.e. a real OSM building footprint occupies almost exactly the spot the
entrance-core fallback placement (`coreX = CONCOURSE_W/2 + 4`, two ends
along `station.heading`, used because `buildStationInterior` does not yet
read `station.entrances[]`) puts the south landing.

**This is not an interior.js bug** — the geometry above is internally
consistent and would be walkable in open ground (confirmed: the same
landing/concourse handoff at the *north* entrance core, `centerZ:
CONCOURSE_LEN/2 + 6, sign: 1`, was not blocked). It is a placement
collision between the synthetic fallback entrance core and real city
geometry now present near Mirpur 10.

**For E2/advisor**: `metro.stations[i].entrances[]` (added by E2 this pass:
4 entrances, `{x,z,letter,side}`) is not yet consumed by `interior.js` —
`buildStationInterior` still always uses the `CONCOURSE_W/2+4` fallback from
the original P0-E3 brief. Swapping the south/north entrance-core placement
to use the real `entrances[]` positions (per the original brief: "E2 is
adding entrances[], use a fallback... if absent") would very likely dodge
this specific building and is the correct long-term fix, but reworking
entrance-core geometry (positions, per-entrance heading, tie-in to the
concourse door gaps) is a larger change than this pass's remaining time
allowed; flagging rather than attempting it half-finished.

**Workaround used only for verification**: to keep testing the concourse,
gate, platform and lift stages downstream, I moved the player laterally
past this specific collision (not a normal player action — `position.set`
directly, feetY unchanged) once the corner blocked all normal movement.
Every other transition in the walk (climb, landing, concourse floor,
platform, gate, TVM) was driven by real `player.update(dt)` physics with
WASD-equivalent input, not teleportation.

## Acceptance walk — feetY log

All stages below at Mirpur 10 (world ≈(148.7, 593.9), heading 0.246 rad).
Values are `player.feetY` (authoritative walking height), confirmed against
`walkable.supportHeightAt(x,z,·)` at each stop.

| stage | local (x,z) | feetY | how reached |
|---|---|---|---|
| street (south, at escalator base) | (14.55, -43) | 0.00 | walked from (14.55,-52) |
| escalator, +1m in | (14.55, -42) | 0.00→0.57 (surface confirmed 0.57) | walked forward |
| escalator, mid-ramp | (14.55, -36) | 3.52 | continued walking (matches ramp slope: 8/14×7≈4.0, close) |
| escalator, near top | (14.55, -32 → -28.5) | 6.10 → 7.61 | continued walking |
| landing (post-fix) | (14.55, -28) | 7.61 (support confirmed 8 at the slab centre) | walked onto landing |
| concourse floor | (3, -5), 2 m inside the CONCOURSE_W/2=10 edge | 8.00 (`7.999` measured, `supportHeightAt`→8 exact) | manual lateral hop past the building-corner block (see above), then settled + `player.update` |
| platform side (verified via `supportHeightAt` only, not walked with full physics due to time) | side A slab, cx≈-4.55 | — | `walkable.supportHeightAt` at the platform slab centre returns `14.5` (DECK_Y), confirming the slab and its psd-line collision wall are registered; not walked end-to-end this pass |

**Not completed this pass** (ran out of session time fighting concurrent
reloads — see below): buying a ticket + tap-in at the gate, walking the
full platform + the 100 m leg, the lift ride, and the exit to the opposite
street. The concourse/gate/TVM/platform/lift code was read and reasoned
about (see `src/interior.js` `buildTicketGate`/`tapIn`/`buildLift`) and
looks structurally sound (gate defaults closed with a no-stuck hint escape
hatch per spec; lift only tweens `feetY`, doesn't relocate `x`/`z` — worth
noting for whoever revisits "opposite side of the road" exit UX, since the
single lift instance is sited near the south entrance only), but was not
exercised end-to-end with real physics this pass.

## Screenshots

- `screenshots/p0-int-01-entrance.jpg` (valid JPEG, 525×262, ~3.9 KB) — camera
  near the south entrance escalator base, facing into the tight approach
  between the concourse structure and a neighbouring building wall. Only
  screenshot that survived this pass's capture pipeline; see below.

**Screenshot capture instability**: `capture()` returns a data URL that, at
the resolution this pass's canvas rendered, is 45,000-65,000+ base64
characters. When the `javascript_tool` result exceeds its size limit it
auto-saves to a file I could reliably `python -c 'json.load(...)'` and
`base64 -D` — that path produced the one valid screenshot above. When the
result came back *inline* (just under the truncation threshold) instead, I
had to reproduce the base64 text by hand into a file via the `Write` tool;
every one of those attempts (2 tried, for a concourse shot) produced a
non-decodable/corrupt JPEG (`file` reports no dimensions, image tools
refuse to open it) — the string is too long to transcribe losslessly this
way. I did not find a reliable way to force the auto-save-to-file path for
every capture in the time available. **Recommendation for whoever resumes**:
lower `capture()`'s JPEG quality/resolution enough that the data URL always
exceeds the auto-save threshold (forcing the reliable file path every time),
or add a small helper to `window.__mirpur` that writes the frame directly
via an endpoint/IPC rather than returning it as a tool-call string.

## What I need from E2 / advisor

1. `src/night.js:233` — add `signMaterial.needsUpdate = true;` after the
   `emissiveMap` assignment (or set it at construction time instead), to
   fix the per-frame `refreshUniformsCommon` throw. Not fixed here — not an
   owned file, and `main.js`'s existing try/catch guard already keeps the
   frame loop alive, so it's not blocking, but it's a real bug worth a
   one-line fix.
2. A real building footprint now sits almost exactly on top of the south
   entrance core's fallback landing at Mirpur 10 (world ≈(155.6, 562.0)).
   Wiring `interior.js`'s entrance-core placement to `station.entrances[]`
   (now populated by E2) instead of the `CONCOURSE_W/2+4` fallback should
   resolve this — but it's a nontrivial rework (per-entrance heading,
   concourse door-gap alignment) I did not attempt this pass.
3. The environment was extremely unstable for scripted browser verification
   this pass: the dev server full-reloaded repeatedly (I observed at least
   5-6 reloads across roughly an hour) as other executors saved concurrent
   edits to metro.js/city.js/streets.js/signs.js, each one silently
   resetting `window.__mirpur`, the walkable registry, and in-progress
   script state. Several of my early debugging detours (e.g. suspecting a
   collision bug that turned out to be a stale-registry artifact from a
   reload mid-investigation) were caused by this. Nothing to fix
   code-side, just flagging it as the dominant source of friction this
   pass, for whoever plans the next one.

## P1-E3c: real entrances, texturing, draw-call bucketing

Owner files this pass: `src/interior.js`, `src/walkable.js` (no walkable.js
edits were needed — its supportHeightAt/registry API already covered
everything this pass needed).

### 1. Real `station.entrances[]` wired in (src/interior.js)

Added `worldToLocal(station, wx, wz)` (interior.js:~103-109), the exact
inverse of the existing `localToWorld` (verified by hand: the forward map is
`[dx;dz] = [[c,s],[-s,c]] [lx;lz]`, whose inverse for a pure-rotation matrix
is its transpose, `[[c,-s],[s,c]]`, giving `lx = c*dx - s*dz`, `lz = s*dx +
c*dz`).

`buildStationInterior` (interior.js:~365-410) now: if `station.entrances[]`
is present and non-empty, converts each entrance's world (x,z) to
station-local (lx,lz) via `worldToLocal` and calls `buildCore` once per
entrance (not once per side as before) at `coreX=lx, centerZ` derived so the
ramp's street-level (loY) end lands exactly on the entrance's own local Z:
`sign = lz<0 ? -1 : 1; centerZ = sign<0 ? lz+RUN_ENTRANCE : lz-RUN_ENTRANCE`.
This puts 4 separate cores at Mirpur 10 (A,B,C,D) instead of 2, and 2 at
Mirpur 11 (A,B). The old synthetic two-core (south/north, `coreX =
CONCOURSE_W/2+4`) fallback is kept, byte-for-byte, in an `else` branch for
when `entrances[]` is absent.

Computed the real local coordinates by hand from docs/METRO-REVIEW.md's
published Mirpur 10 entrance table (station x=148.69, z=593.93, heading=
0.246 rad) to sanity-check the transform before running it live:
entrance A -> local (-16.50, -24.00), B -> (-16.50, 24.00), C -> (16.51,
-24.00), D -> (16.50, 24.01). Clean symmetric numbers (|lx|~16.5, |lz|~24),
which is a good sign the transform is right — A/C share lz (both "south"),
B/D share lz (both "north"), A/B share lx (both the -1/"west" side), C/D
share lx (+1/"east"). Confirms the *real* entrances are lateral (offset in
X, well outboard of the concourse's own CONCOURSE_W/2=10 edge) but sit
*within* the concourse's Z-span (|lz|=24 < CONCOURSE_LEN/2=30) — a materially
different arrangement from the old fallback, which put its two cores beyond
the concourse's Z ends (|centerZ|=36 > 30). Flagging this because it means
the entrance-core ramps for real entrances run alongside the concourse box
rather than off its ends, and their concourse-side landing must punch through
the concourse's *side* wall (see next item), not approach through open space
past the end the way the fallback did.

### 2. Landing width bug that would have recurred (interior.js `buildCore`)

E3b's fix widened the landing `halfW` from 2.3 to a flat 6 for the old
fallback's `coreX=14`. With real entrances at `|coreX|~16.5`, a flat 6 would
again leave the landing's inner edge (`coreX-6=10.5`) *outside* the
concourse slab edge (`CONCOURSE_W/2=10`) — the identical bug, recreated by
the coordinate change alone. Fixed by making `landingHalfW` dynamic:
`Math.max(6, Math.abs(coreX) - CONCOURSE_W/2 + 2)` (interior.js, in
`buildCore`), which reduces to the old flat 6 for small `|coreX|` (the
paid-side platform-access cores, `coreX=+-6`) and grows to give a real
>=2 m overlap for the wider real-entrance cores (e.g. 8.5 for `|coreX|=16.5`).

### 3. New: perimeter-wall door gaps at each real entrance

The concourse's two long (X-side) perimeter walls previously had no gap
logic tied to entrance position — the old fallback's cores approached from
beyond the concourse's own Z ends, where no wall exists at all, so no gap
was ever needed. Real entrances approach from the *side*, over most of which
the perimeter wall is solid, so without a gap every real entrance's landing
would be walled off from the concourse exactly like the OSM-building
collision E3b hit, except self-inflicted this time. Added
`buildPerimeterWalls(bucket, collision, walkable, station, wallH,
gapsBySide)` (interior.js): builds each side's wall as 1-3 segments around a
list of `{z, half}` gaps instead of one unconditional split at Z=0. Each
real entrance contributes a gap centred on its own `lz`, sided by
`entrances[].side`, half-width = the same dynamic landing half-width + 1 m
margin. The old fallback path does not populate any gaps (matches its
original geometry, which needed none).

### 4. Textures wired in (docs/TEXTURES-METRO.md slugs/tints/repeats)

`loadTextureSet` (src/textures.js, import only) is called once per material
key through a small cache (`texMat`, interior.js:~65-82): creates a
`MeshStandardMaterial` immediately with the spec'd flat tint so the first
frame isn't blocked on network, then swaps in `map`/`normalMap`/
`roughnessMap`/`aoMap` when the async load resolves.

| interior surface | slug | tint | repeat (m) | notes |
|---|---|---|---|---|
| concourse floor | tiles-light-stone | #EDEAE4 | 0.8 | |
| concourse/platform walls | panel-cream | #EDEAE4 | 0.8 | |
| concourse ceiling | aluminium-brushed | #E4E6E6 | 1.0 | procedural strip/baffle pattern, ~0.9m bars + 0.15m gaps across CONCOURSE_W |
| platform floor | granite-dark-polished | #4F5250 | 0.6 | roughness 0.35 |
| stair treads | granite-dark-polished | #4F5250 | 0.6 | roughness 0.4, real stepped geometry (see below) |
| PSD frames, gate lane frames, entrance/access-core screens, lift cladding | steel-brushed | #C9CDCE | 1.0 | metalness 0.9, roughness 0.35 |
| tactile strips (concourse + platform) | flat colour (no sourced slug) | #F4C430 | — | not in the texture brief; kept as a flat MeshStandardMaterial |
| TVMs | flat colour (unchanged) | #E4E4DE | — | not assigned a slug in the brief; left as-is |

UV scaling: per the brief ("scale UVs by world size ... uv * (size /
repeatMetres)"), added `pushBox(bucket, key, material, w,h,d, x,y,z,
repeatMetres, uvDims)` which multiplies the BoxGeometry's default 0-1 UVs by
`(dimU/repeatMetres, dimV/repeatMetres)` before baking the geometry into its
material bucket. `uvDims` defaults to `(w,d)` (right for floor/ceiling
slabs, where the top/bottom face is the one that matters) and is passed
explicitly as `(d,h)` or `(length,height)` for walls/screens/PSDs, where the
dominant visible face is length x height, not thickness x length. This is a
single approximate scale applied to *all* of a box's UVs (not per-face),
which is wrong for the thin/end faces of each box but those aren't the
faces a player standing in the corridor sees; acceptable given the pass's
time budget, flagged here for anyone who wants to do this properly with
per-face UV islands.

Also added real stepped stair-tread geometry (`buildCore`, interior.js):
previously stairs had zero visible geometry (only the invisible smooth ramp
+ two flanking screens) — per WALKABLE-INTERIOR-DESIGN.md ("treated as a
smooth ramp; the visible geometry still has real steps"), each core now
also pushes `steps = clamp(round(|hiY-loY|/0.18), 6, 40)` granite tread
boxes along the stair half of the core (the escalator half stays a bare
moving ramp, no visible steps — reads correctly, escalators don't have
individually-textured steps at this distance). Player support still comes
only from the smooth ramp registered earlier in the same function; the
treads are visual-only and intentionally don't perfectly align underfoot
(same intentional smoothing WALKABLE-INTERIOR-DESIGN.md calls for).

### 5. Draw-call bucketing (item 4 of the brief)

Replaced the old `group.add(box(...))` per-fixture pattern with
`createBucketer()` (interior.js): every fixture's BoxGeometry is baked
(translated into station-local position) and pushed into a `Map` keyed by
material name; `bucket.flush(group, name)` merges each key's geometry list
with `mergeGeometries` (same `three/addons/utils/BufferGeometryUtils.js`
import metro.js already uses) into one `Mesh`, added to the group. Material
keys in use per station: `concourseFloor, tactile, wall, ceiling,
platformFloor, stairTread, steel, tvm` — 8 buckets, so **8 draw calls added
per station**, well inside the "<40" budget regardless of how many
individual fixtures (screens, TVMs, gate frames, tactile strips, stair
treads, lift box, PSD rails...) are placed. `bucket.flush` logs the actual
count via `console.debug('[interior] <station>: N draw calls (bucketed)')`
for live verification.

### 6. Browser verification: BLOCKED this pass (tab cap)

`tabs_create` was retried 5 times over ~5 minutes (per docs/briefs/P0-COMMON.md's
"wait 60 s and retry up to 5 times" policy) and failed every time with
"Could not open a new tab (Browser pane gone, gate off, or tab cap reached)".
`tabs_context` showed the same 9 tabs (all `http://localhost:5183` except one
`file://.../index.html`) occupying the ~9-tab cap across all 5 attempts,
unchanged — other executors' tabs, which per P0-COMMON I must not act on.
No live capture, no feetY log from real physics, no screenshots were
possible this pass. This is an environment/concurrency constraint, not a
code issue.

**What was verified instead (static, not live):**
- `node --check src/interior.js` passes.
- Hand-computed `worldToLocal`/`localToWorld` round-trip for all 4 Mirpur 10
  entrances (A-D) using the exact station/entrance coordinates published in
  docs/METRO-REVIEW.md: every entrance's world (x,z) maps to a local (lx,lz)
  and back to the identical world (x,z) to 3 decimal places (script:
  `/tmp/sim.mjs`, not checked in). Confirmed A/C share lz=-24 (south),
  B/D share lz=+24 (north), A/B share lx=-16.5 (west), C/D share lx=+16.5
  (east) — exactly matching the `side` field E2 recorded.
- Simulated `buildPerimeterWalls`' segment-splitting logic with those same
  4 entrances' derived gaps: for both sides, the two entrance gaps (each a
  clipped [z-half, z+half] band, half≈9.5m) correctly swallow both ends of
  the ±30 m wall run, leaving a single solid wall segment in the middle
  ([-14.5, 14.5]) — i.e. each entrance's landing has an open path into the
  concourse and the wall between entrances stays solid. No zero/negative-
  width segments, no NaN.
- `landingHalfW` formula checked for both real entrances (|coreX|=16.5 ->
  8.5, comfortably >6, inner edge at coreX-8.5=8.0, 2m inside the concourse
  edge) and the unchanged paid-side platform-access cores (|coreX|=6 -> 6,
  same as before E3b's fix, no regression).

**Not verified this pass (needs a browser tab):** the feetY log for the
full walk (street -> entrance D at Mirpur 10 and one entrance at Mirpur 11
-> concourse -> TVM -> gate -> platform-access stair/escalator -> platform
full length -> lift -> exit), the 8 low-res screenshots, actual rendered
texture appearance, and the live `console.debug('[interior] ... draw
calls')` counts. The geometry/collision logic above is reasoned through and
internally consistent, but per P0-COMMON I am not claiming a walk I did not
see. If browser access frees up before this session ends, live verification
will be run and this section updated; otherwise the next executor should
start there — the code is in a testable state (`window.__mirpur.player`,
`.update(0)`, `.capture()` per the existing hook).

## Advisor live verification 19:40 (after E3c), Mirpur 10 entrance D
Method (works in a hidden pane): via window.__mirpur,
`p.teleport(169.8, 614.5, 1.68, 0.25); p.update(0)`, then per frame
`p.keys.add('KeyW'); p.update(1/60); interior.update(1/60, p)`. The
interior only builds inside interior.update, so it MUST be called; the
frame loop does not run while the pane is hidden.
Results:
- Registry has 27 surfaces at Mirpur 10; entrance D ramp centre
  (167.7, 606.7) runs from street (foot ~169.7, 612.7) up to the landing
  (166.9, 598.6, y=8). Height grid confirms the ramp axis is world
  (-0.25, -0.97), i.e. player yaw +0.25 walks up it.
- PASS: stair climb, feetY 0 -> 3.65 (mid) -> 7.75 -> 8.0 at the top.
- FAIL 1: keep walking straight past the landing (2.4 m deep) and you
  fall to the street (feetY 8 -> 0). The landing needs collision
  railings on its three non-concourse edges (registry addSegments).
- FAIL 2: turning toward the concourse at the landing, movement stops at
  (164.2, 598.4): the perimeter wall is solid there. Cause: E3c centred
  each wall gap on the entrance's street-level foot Z (entrance D world
  170.5, 613.2) but the stair reaches the concourse ~14 m further along
  at the landing (166.9, 598.6). The gap must be centred on the LANDING's
  local Z and be the landing's width.
- Also seen in the height grid: a 2 x 2 m hole in the y=8 support near
  (165.7, 604.7) (null support inside the concourse footprint). Check
  the concourse slab vs landing overlap there.
- Interactables exist: 3x "E: buy ticket" around (137-142, 573-574), a
  gate line of "E: tap in" at z~587-590, entrances A-D.

## 2026-09-07 — P11-A: black slabs, invisible stairs (docs/briefs/P11-A-INTERIOR-LOOK-AND-STAIRS.md)

Executor pass, `src/interior.js` only, per the brief's file lock. No browser
access this pass (pane shared/throttled with the advisor, per the brief) —
changes below are reasoned/static-checked (`node --check`) only; the advisor
verifies visually.

1. **Black steel** (`TEXTURE_SPECS.steel`): `metalness` 0.9 -> 0.25,
   `roughness` 0.35 -> 0.45, per the brief's live-tested numbers. Affects
   every steel-bucket fixture: stair guardrails, PSD barrier, AFC gate
   paddles, lift box/shaft.

2. **Tint x albedo double-darkening**: reworked every `TEXTURE_SPECS` tint by
   solving `newTint = intended * 255 / mapMean` per channel (clamped to
   0xff) using the brief's measured map means, instead of eyeballing new hex
   values. `concourseFloor`, `wall` and `steel` all clamp to `0xffffff`
   (their old tints were far enough above the map's own mean that the
   correction saturates — this is correct: it just lets the photographed
   albedo show through unmultiplied). `platformFloor`/`stairTread` land on
   `0x7d8a84` (still reads dark once multiplied by the granite map, but no
   longer crushed to near-black by ACES). `ceiling` moves slightly to
   `0xf0f1f2`. Recorded the full arithmetic in a comment block above
   `TEXTURE_SPECS` per the brief, specifically to stop a future pass from
   "helpfully" darkening these back.

3. **Invisible stairs / no visible escalator**: replaced the old opaque
   full-height flanking panel (0.15 x ~10 x ~16 m of black steel per side,
   per core) with `buildGuardrail()` — a raked kick panel up to 1.1 m plus
   two handrail tubes (0.9 m / 1.0 m above the ramp line), built at the same
   X as the pre-existing flanking collision walls (`coreX +- 2.4`), which
   are unchanged and still load-bearing. Added a third, kick-less guardrail
   at `coreX` (handrail only) as the divider between the stair and
   escalator. Added `buildEscalatorDeck()`: a raked steel deck plus static
   comb/step ridges every ~0.4 m along the run — the escalator previously
   had zero visible geometry. The rake for both is computed with
   `THREE.Quaternion.setFromUnitVectors` (canonical axis -> along-slope
   direction) rather than hand-derived trig, specifically because this pass
   has no way to visually catch a sign error in manual trig.

4. **0.1 m null-support sliver at the core centreline**: stair ramp widened
   `halfW` 1.1 -> 1.2 (`stairX` unchanged at `coreX-1.15`, edge moves
   `coreX-0.05` -> `coreX+0.05`); escalator centre pulled in `coreX+0.55` ->
   `coreX+0.5` (`halfW` unchanged at 0.5, edge moves `coreX+0.05` ->
   `coreX+0.0`). The two ramps now overlap by 0.05 m instead of gapping by
   0.1 m. Also updated the stair-tread visual width and the
   `gapLo`/`gapHi` landing-rail-gap calculation, which both previously
   hardcoded the old 1.1/0.5 values, to reference the new named constants
   (`stairHalfW`, `escHalfW`) so they can't drift out of sync again.

5. **Lift half underground / no shaft**: street car's box now sits at
   `y = carH/2` (base on the ground) instead of `y = 0` (centred on the
   ground, half buried). Added a flavour glazed shaft: four steel corner
   posts running the full `0 -> DECK_Y` travel plus a lintel band at each of
   the 3 stops (street/concourse/platform) framing a car-sized door opening,
   so each floor's landing reads as connecting to something rather than the
   car existing only at street level.

**Draw calls**: no new bucket keys were introduced (still `concourseFloor,
tactile, wall, ceiling, platformFloor, stairTread, steel, tvm` — 8 buckets);
every new fixture above (guardrails, escalator deck/ridges, lift posts and
lintels) was pushed into the existing `steel`/`stairTread` buckets. Draw-call
count per station is therefore unchanged, well inside the brief's "+4"
budget.

**Not done / disagreed with**: item 4's brief text offered two alternative
fixes ("widen the stair ramp to halfW 1.15 or shift escX to +0.5"); doing
only one of those verbatim (`escX` alone) still leaves a 0.05 m gap by my
arithmetic (stair edge stays at `coreX-0.05`, escalator edge moves to
`coreX+0.0`), so I combined both (stair to 1.2, escalator centre to +0.5) to
get a small positive overlap rather than an exact hairline touch that float
rounding could reopen. Also left the pre-existing gap between the
escalator's outer edge and the core's outer collision wall (`escX+escHalfW`
at `coreX+1.0` vs the wall at `coreX+2.4`) unfixed — it is not the
centreline sliver the brief's acceptance criteria describe, it existed
before this pass with a nearly identical size, and closing it was out of
scope for this brief. Everything else in the brief was implemented as
specified. Live visual verification (does the stair actually read as open
from the footpath, do the guardrail rakes point the right way, does the
lift shaft look right) still needs the advisor's browser pass — flagged in
the report back, not silently assumed.

## 2026-09-07 — P11-H: revert pre-division, use normalised albedo maps

Implemented `docs/briefs/P11-H-ALBEDO-NORMALISATION.md`'s `src/interior.js`
half. P11-A's tint pre-division (`newTint = intended * 255 / mapMean`,
clamped per channel) fixed the near-black concourse but overshot: the
advisor confirmed live that `concourseFloor`, `wall` and `steel` all
clipped to `#ffffff` (washed-out white concourse instead of cream panels)
and `platformFloor`/`stairTread` landed on light grey `#7d8a84` instead of
dark polished granite `#4f5250`.

Deleted the pre-division comment block and arithmetic. `TEXTURE_SPECS`
tints restored to the owner's documented intended values:
`concourseFloor`/`wall` -> `#edeae4`, `ceiling` -> `#e4e6e6`,
`platformFloor`/`stairTread` -> `#4f5250`, `steel` -> `#c9cdce`. `texMat()`
now requests `loadTextureSet(spec.slug, { normalise: true })`
(src/textures.js, same pass) so the colour map's mean is scaled toward
white at the source instead of the tint being distorted to compensate.
Kept P11-A's `steel` metalness/roughness change (0.9/0.35 -> 0.25/0.45) —
correct, not in question here.

Not verified visually (browser pane is the advisor's, per this brief's
constraint) — `node --check src/interior.js` passes.

## 2026-09-07 — P11-I: platform floor/height reconciliation, per-bay PSD, wayfinding signs

Implemented `docs/briefs/P11-I-PLATFORM-GEOMETRY-AND-PSD.md`'s
`src/interior.js` half. Edited only `src/interior.js` (metro.js is the
other owner this pass; signs.js/traffic.js/textures.js/main.js/
stationlife.js untouched, per the brief). Did not use the browser preview
tools (shared/throttled pane, advisor verifies); `node --check
src/interior.js` passes.

### Item 0 — floor/height reconciliation (read `docs/WALKABLE-INTERIOR-DESIGN.md` first, per the brief)

`buildPlatform`'s walkable slab was `PLATFORM_W` (5 m) wide, hugging the
track, while metro.js's visible floor ran all the way out to the canopy
columns (~8.75 m) — a 3.6 m strip of visible, unsupported floor the
advisor measured live. Ownership split per the advisor's stated
preference: **metro.js owns the visible floor and tactile strip** (keeps
its own width, drops its slab 0.4 m so the top face lands exactly on
`DECK_Y`); **interior.js owns the walkable height convention** already.
This file's own duplicate floor box and tactile-strip `pushBox` calls in
`buildPlatform` are deleted; the walkable slab is widened to
`platformOuter = CANOPY_SPAN/2 - 0.3` (identical formula to metro.js's) so
the two exactly coincide. The outer collision wall (`outerX`) is
recomputed from the same `platformOuter`, replacing the old
`trackHalf+0.1+PLATFORM_W` offset that no longer matched the widened deck.

Also deleted: `buildPlatform`'s own visible steel PSD-wall box (a second,
slightly-inboard slab parallel to metro.js's real PSD frame). With real
door geometry now in metro.js (see Item 1), that duplicate would sit as a
permanently-solid wall directly behind the visible sliding leaves, hiding
every door opening regardless of `setPsdOpen`/`setPlatformDoors` — worse
than the original bug for Item 1's acceptance criterion.

### Item 1 — per-bay PSD collision + `setPsdOpen`

`buildPlatform`'s single continuous `wallLocal` PSD segment is replaced by
`buildPsdBarrier()`: fixed (always-solid) wall segments between door bays,
plus one dedicated, individually-degenerate segment per bay — the same
AFC-gate trick `buildTicketGate`/`tapIn` already use (collapse the segment
to a point; `resolveCollision` skips it). Bay Z-centres come from
metro.js's `platformDoorBays(stationName, side)`, so the collision gap is
locked to the same 24 real train-door positions the visible sliding leaves
use — not a separately-eyeballed pitch. `BAY_HALF = 1.0` is duplicated as
a literal in both files (matching metro.js's own constant of the same
name) since interior.js cannot import a non-exported metro.js internal;
flagged here in case a future pass wants to export it instead.

Exported from `createInteriorSystem()`, exactly per the brief's contract:
```js
setPsdOpen(stationName, side, amount01)
```
`amount01 > 0.5` opens (degenerates) every bay gate on that platform edge;
otherwise all gates are restored solid. A station whose interior hasn't
been lazily built yet (player never came within 120 m) is a silent no-op,
matching metro.js's equivalent guard on `setPlatformDoors`.

**Pre-existing, not touched this pass:** metro.js's visible PSD frame sits
at local X `TRACK_GAUGE_OFFSET + 0.35` (2.3), interior.js's own collision
line at `trackHalf + 0.05` (2.0) — a 0.3 m offset that predates this brief
and isn't part of Item 0's asks (floor width/height + tactile strip +
outer wall only). Noted for the advisor in case it matters for Item 1's
visual/collision alignment.

### Item 2 — wayfinding signs

Imported (read-only) `LINE_STOPS`, `makeLineStripMap`, `makeDirectionBoard`,
`makePlatformNumberSign`, `makeExitSign`, `makeNextTrainDisplay` from
`src/signs.js`. All placement lives in a new `placeWayfindingSigns()`,
called once per station from `buildStationInterior` after the lift:

- Strip map: one on the concourse's -X perimeter wall near the TVM bank
  (~1.6 m above `CONCOURSE_Y`), one per platform mounted at the canopy
  edge at ~1.6 m above `DECK_Y`.
- Direction board over each paid-side platform-access core (the
  `coreX = side*6, centerZ=12` cores), at the core's own `DECK_Y` landing
  Z (`12 + RUN_PLATFORM + 1`, matching `buildCore`'s `y1Z` exactly), facing
  `-Z` (`rotation.y = PI`) so it reads to a passenger climbing toward `+Z`
  (this core's `sign: -1` means `escDir = +1`, i.e. it climbs toward `+Z`)
  as they arrive at the top of the stairs.
- Platform number sign at the same access point, offset 3 m further onto
  the platform so it doesn't overlap the direction board; platform 1 =
  side -1, platform 2 = side +1 (arbitrary but stable numbering — nothing
  in the scene data assigns real platform numbers).
- Exit sign over each entrance core's concourse-side landing (reusing the
  same `landingZ`/`sign`/`centerZ` computation `buildStationInterior`
  already does for the wall-gap logic), listing that entrance's letter,
  facing back toward the concourse centre (X=0).
- Next-train display hung per platform at `DECK_Y + 3.0`, static rows
  (`"<dest>   3 min"` / `"<dest>   9 min"`) — `mesh.userData.update(lines)`
  is there for stationlife.js to drive later, per the brief.

**Direction sense (brief: "getting this backwards is worse than not having
the sign").** Two derivations, both in code comments in `interior.js`:

1. `localNorthSign(station, metro)`: station.heading only gives a local
   track-tangent direction, not compass direction. Using
   `signs.js`'s `LINE_STOPS` order (south→north) restricted to the four
   *modelled* stops (`Mirpur 10 → Mirpur 11 → Pallabi → Uttara South`,
   indices 10-13), I take the real-world vector from a station to whichever
   modelled neighbour is next in that order (or the previous one, sign
   flipped, if there's no next), and dot it against local +Z's world
   direction. This is a derivation from the scene's own station
   coordinates, not a guess.
2. `sideIsNorthbound(station, side, metro)`: telling *which platform*
   (local X sign) serves northbound trains needs one more fact the scene
   data doesn't encode anywhere: which physical track carries which
   direction. I assumed DMTCL trains keep left (mirroring Bangladesh's
   left-hand road traffic, since the elevated line runs directly over the
   road median the whole route), i.e. a northbound train runs on the track
   to its own left. This is the one genuine **assumption**, not a
   derivation — flagged loudly per the brief. The advisor should sanity
   check it live (e.g. watch which physical rail a train actually takes at
   Mirpur 10/11 and compare to the direction board on that platform).

**Not done / known gap:** each `makeLineStripMap`/`makeDirectionBoard`/etc.
call returns its own single-plane `Mesh` (cached geometry+material per
distinct content, but still a separate scene-graph node/draw call per
placement) — these are added directly to the station's interior `group`,
not through `createBucketer()`'s merge-by-material bucket, since each
sign's texture is unique content that can't share a material with another
sign's. That is roughly 10-14 extra draw calls per station (concourse map
+ 2 platform maps + 2 direction boards + 2 number signs + 2 next-train
displays + 2-4 exit signs), on top of Item 1's 1 extra draw call (the door
leaves), above the brief's "~6 total" Acceptance #5 budget. Bringing this
down further (e.g. an atlas of multiple sign textures into one material)
would require a signs.js change, out of this file's fence this pass —
reporting rather than silently accepting or silently fixing out-of-fence.

Could not verify any of this visually (signs readable in place, direction
boards pointing the right way, doors opening/closing, no floor you fall
through) — per the brief the advisor verifies live in the browser.

## P11-K — platform direction boards corrected (2026-09-07, advisor-written)

The P11-I pass placed the direction boards from a real-world assumption
("DMTCL trains keep left, mirroring Bangladeshi road traffic"), flagged
honestly at the time. It did not match this build: the advisor measured a
train berthing on the **+X** platform at Mirpur 10 and then calling at
Mirpur 11, Pallabi and Uttara South — i.e. +X is northbound — while the
board there read "Motijheel". Both boards were on the wrong platform.

Now derived, not assumed: `metro.js`'s `dir:1` trains always sit at local
X = +TRACK_GAUGE_OFFSET (an identity of how `trackLines`/`offsetPolyline`
are built, independent of heading), and `dir:1` is northbound in this
build's track data. `sideIsNorthbound = side * localNorthSign(station, metro) > 0`.

Verified live at Mirpur 10: boarding on side +1 leads to Mirpur 11 ->
Pallabi -> Uttara South, and the board at local X +6 now reads
"Uttara North". Do NOT "correct" this back to a left-running convention
without re-measuring which track the trains actually use.

## 2026-09-08 — P11-P: visible lift + repositioned off the road, gate legibility

Executor (Sonnet) worked to
`docs/briefs/P11-P-ENTRANCE-LIFT-PLATFORM-ACCESS.md`. Owner: `src/metro.js`
and `src/interior.js` only. Not verified live this pass — browser preview
stays advisor-only per the brief; everything below is reasoned from the
code and this build's own constants, not screenshotted. Advisor: please
re-check all three items live, especially the lift's exact footprint.

**Item 2 — lift was "4 thin sticks", no visible lift (advisor, live;
REAL).** `buildLift` rebuilt around three pieces instead of one flavour
box: (1) a glazed/framed shaft enclosure (thicker 0.18 m corner posts +
glass panels on 3 of 4 sides) running the full `0 -> DECK_Y` travel so the
shaft reads from every floor, not just street level; (2) a landing-door
frame (lintel + two static leaves) at each of the 3 stops so it's obvious
where the lift actually stops; (3) a real car — floor, ceiling, three
opaque `steel` sides, one glazed front — sized 2.0 x 2.2 x 2.3 m per the
brief. The shaft and doors are static and merged into the shared
per-station bucket like everything else in this file (the new `liftGlass`
bucket key is +1 draw call per station); the car is its own small
`THREE.Group` (+2 draw calls: opaque body, glazed front) because, unlike
everything else here, it has to move.

**Item 2 / "must not be at a level unrelated to state.liftTween".** The
car doesn't animate smoothly (the brief says that's fine) — the same
`action` closure that starts `state.liftTween` (which moves the *player*)
now also sets `carGroup.position.y = target` directly, so the car
teleports to match in the same frame. There is no per-frame code keeping
car and tween in sync — by construction they're set from the same
`target` value at the same call site, so they cannot drift apart.

**Item 2b — lift stood in the carriageway (owner, added to the brief;
REAL, most embarrassing of the three).** Old placement was the fixed
station-local point `(8, -(CONCOURSE_LEN/2-6))`. `metro.js` puts its
portal columns / footpath edge at `PORTAL_COL_X = 13.5` and estimates the
carriageway at `roadHalf = 12` either side of the spine — local X = 8 is
deep inside that, so the lift's street-level stop, car and shaft all stood
in the middle of the road.

This needed more than "move X past 13.5" because the lift doesn't move in
X/Z (only `feetY` tweens — see `buildLift`'s own note), so *one* (lx,lz)
has to work at all three stops at once, and two of the three constraints
pull in opposite directions:

- Street level needs `|lx| >= PORTAL_COL_X` (outside the carriageway).
- Platform level needs to stay inside `nearestInteractable`'s range=9
  check, whose vertical term alone (the marker sits at a fixed
  `CONCOURSE_Y`, the player stands at `DECK_Y`) already spends ~7.5 m of
  that 9 m budget — leaving only ~5 m of *horizontal* slack from the
  platform floor (which only reaches out to `CANOPY_SPAN/2 - 0.3 ~= 10.7`
  m). Moving all the way out to an entrance's own `coreX` (~16.5 m) would
  have satisfied the street constraint while making the lift unreachable
  from the platform — a regression the brief doesn't ask for and the
  advisor didn't flag, so it stayed in scope to avoid.

Landed on `liftLx = entranceSide * (METRO.PORTAL_COL_X + 0.5)` — just
outside the footpath edge, close enough to the platform's outer edge
(~3.3 m short) that the range-9 check still clears it (by ~0.8 m, checked
by hand against this build's fixed constants: `CANOPY_SPAN=22`,
`PLATFORM_W`-derived outer edge ~10.7). `PORTAL_COL_X` is read off
`METRO.PORTAL_COL_X` (now exported by metro.js, see METRO-REVIEW.md's
matching entry) rather than hardcoded, per the brief.

`liftLz` is anchored to `station.entrances[0]`'s own Z, reusing the exact
`landingZ` formula this file already computes for that entrance's
perimeter-wall door gap (so the lift's concourse-level stop sits in that
same opening, not behind solid brick), offset `2*RUN_ENTRANCE + 6` m back
from the entrance's street foot. Checked by hand against this build's
fixed layout (`CONCOURSE_LEN=60`, portal columns every 15 m starting at
`-halfL+7.5 = -22.5`, entrance stair shells running `RUN_ENTRANCE*2=14` m
from each entrance's foot): the resulting point clears the entrance's own
stair-shell footprint by ~6 m, the nearest portal column by ~2 m, and
lands inside the door gap with ~2 m of margin either side. All of this is
geometry-only reasoning, not a live measurement — flagged per the brief's
own "confirm nothing intersects" ask; a station whose entrance/portal
layout differs from these numbers (there isn't one in this build, but if
`legZs`/`PIER_SPACING` ever changes) should have this re-checked.

**Item 3 — AFC gate line legibility (advisor: "not a geometry bug,
signage/legibility only"; the paid-side stairs' climb is untouched by this
pass).**

- *Gate now visibly a gate.* `PALETTE.gateOpen`/`gateClosed` existed in
  this file already but were never actually used anywhere. Added one
  small `THREE.InstancedMesh` light per lane (6 total, 1 draw call), red
  or green, driven every frame by `updateGates()` off the exact same
  `gate.openUntil` value `resolveCollision` already keys off — visual and
  collision read from the same state, so they cannot disagree.
- *TVM findable from arrival.* One "TICKETS / PLATFORMS" board (own
  canvas texture built locally in this file — signs.js's
  `makeDirectionBoard` hardcodes "Trains toward {dest}" text, so it can't
  be repurposed for a plain two-way sign without editing signs.js, which
  is out of fence this pass; this is the "or an equivalent" the brief
  allows) hung over the unpaid side of the gate line, `TICKETS` arrow
  pointing at the TVM (-Z, always true — the TVM bank is fixed at the very
  -Z end of the concourse), `PLATFORMS` arrow pointing at the paid-side
  stairs (+Z). The rotation that makes canvas-left/right map to world
  -Z/+Z was checked with a throwaway Node script against `three`'s own
  quaternion math (not eyeballed), matching the sign convention
  `mountFacingCentre` already uses elsewhere in this file.
- *Hint made louder, and honest.* `tapIn()`'s comment claimed "hint, never
  a hard block" while the code left the gate segment solid — genuinely
  contradictory, and exactly how this shipped as a silent block. Comment
  now says what the code does. The advisor's stated preference (keep the
  gate meaningful, make the route obvious rather than removing the block)
  is what's implemented: the block stays, but the hint text now names the
  TVM and the sign to follow, and its window went 2000 -> 4000 ms (both
  the failed-tap-in hint and the open-gate window — the latter also
  because a 2 s open window plus a slow crossing of a 3.8 m lane could
  re-close on a player still standing in it, a silent block the brief
  explicitly asked to rule out).

**Not verified live:** all of the above. In particular the advisor should
confirm the lift's shaft/car don't visually clip a portal column or
entrance shell (the geometry-only check above is careful but this file's
own header warns visual bugs here don't show up without the browser), and
that the TICKETS/PLATFORMS arrow directions actually point the right way
in-game.

**Draw-call accounting for this pass** (brief's Acceptance #5, "~6" as an
increment over pre-P11-P, not the running total INTERIOR-PASS.md already
flagged as over budget from signage): gate lights +1, `liftGlass` bucket
+1, lift car (body + glass) +2, wayfinding board +1 = **+5 draw calls per
station**. The entrance-shell risers in metro.js added zero (merged into
the existing `brick`/`concrete` buckets).

## 2026-09-08 — P11-P section 2c: lift now serves floors, not "the farthest stop"

Owner, appended to P11-P after the rest of that brief shipped: "the lift
should take to the ticket floor! not platform". Confirmed and fixed in
`buildLift` (`src/interior.js`).

**The bug.** `stops = [0, METRO.CONCOURSE_Y, METRO.DECK_Y]` and the old
interaction picked `stops.reduce((a, b) => (Math.abs(b - cur) > Math.abs(a
- cur) ? b : a))` — whichever stop is *farthest* from the player's current
`feetY`. From street level (`cur = 0`) the distances are 0/8/14.5, so it
always resolved to 14.5 — the platform. The concourse (`CONCOURSE_Y = 8`,
the actual ticket floor) could never win that comparison from anywhere,
so it was unreachable by lift. Worse, this let a ticketless player ride
straight from the street to the platform, bypassing the AFC gate line and
the TVM this same brief had just added signage for.

**Fix — adjacent-floor selection.** `liftTargetIdx(cur)` finds whichever
of the 3 stops the player is currently closest to, then returns its
*neighbour*: street and platform each have exactly one neighbour
(concourse), so calling the lift from either always goes to the
concourse. The concourse has two neighbours (street below, platform
above); per the brief's own suggested simplification ("either offer the
choice or default to going up") it defaults to going up, i.e.
concourse -> platform. Net routes: street <-> concourse <-> platform,
never street -> platform in one hop.

**Fare-gate parity (item 8).** The concourse -> platform hop is the one
that matters for fare evasion, so it now runs the exact same check as
`tapIn`'s gate: if `!state.hasTicket`, the lift refuses the trip (car
does not move, player is not moved) and shows the identical hint text
("No ticket - buy one at the TVM (follow the TICKETS sign) before tapping
in") for 4000 ms. Street -> concourse and platform -> concourse are not
gated (there's nothing to evade in either direction — you're leaving the
paid side or you're already on it).

**HUD label (item 7 / the brief's "the label is also what tells the
owner it is working").** `interactables[].label` can now be a function of
the player, not just a string — `nearestInteractable`'s consumer in
`update()` calls it if so. The lift's label is
``(player) => `E: lift to ${stopName(stops[liftTargetIdx(player.feetY)])}` ``,
so standing at street level shows "E: lift to concourse", at the
concourse shows "E: lift to platform", and on the platform shows "E: lift
to concourse" — always the floor the next press will actually send you
to, computed the same way the action itself picks its target. No other
`label` in this file uses the function form; plain strings still work
unchanged (`buildCore`, `buildTicketGate`, the TVM interactable).

**Not changed:** the ~1.2 s eased `state.liftTween`, the car's teleport-to-
target visual (`carGroup.position.y = target`), the shaft/car geometry,
and `setPlatformDoors`/`platformDoorBays`/`setPsdOpen`'s exported
signatures. `src/metro.js` was not touched — the fix was fully containable
in `src/interior.js`.

**Not verified live** (browser pane is the advisor's, per this session's
instructions): that the HUD text actually updates as the player rides
between floors, and that a ticketless player standing on the concourse
and pressing E at the lift sees the same hint as at the gate rather than
silently doing nothing.

## 2026-09-08 — P11-Q: consume metro.js's entrance direction instead of re-deriving it

Executor (Sonnet) worked to
`docs/briefs/P11-Q-TWO-ENTRANCE-STATION-STAIR-DIRECTION.md`. Owner:
`src/metro.js` and `src/interior.js` only. Not verified live this pass —
advisor does the visual check; see `docs/METRO-REVIEW.md`'s matching dated
section for the full root-cause writeup (the bug and the measured signs at
all four stations are documented there; this entry covers interior.js's
half of the fix).

**The bug, from this file's side.** Three separate call sites in
`interior.js` each independently ran `worldToLocal(station, en.x, en.z)`
on a `station.entrances[]` entry and then took `lz < 0 ? -1 : 1` —
`placeWayfindingSigns`'s exit-sign placement, the main entrance-core
build loop, and the lift's placement anchor. At a 2-entrance station
(every station except Mirpur 10) the entrance's true local Z is exactly
0, but recovering it through `worldToLocal()`'s sin/cos round-trip from
the *already-transformed* world coordinates turns that legitimate zero
into zero-plus-floating-point-noise — and it was that noise's sign, not
anything meaningful, deciding which way each entrance's stair ran. This
didn't even reliably agree between the three call sites for the same
entrance, since each one ran its own independent trig.

**Fix.** Added `entranceLocal(station, en)`, a single helper (right after
`worldToLocal`) that:
- still calls `worldToLocal` for `lx` (nothing else publishes it), but
- prefers `en.lz` (the exact local Z metro.js already knew, before any
  transform) over the recovered value, and
- prefers `en.dir` (metro.js's own `stairSign` for that entrance's shell)
  over re-deriving anything from `lz`'s sign.

The old `lz < 0 ? -1 : 1` is kept, but demoted to a fallback used only
when `en.dir`/`en.lz` are absent (a scene predating this field) — per the
brief's "keep a documented fallback ... only for the case where dir is
absent". All three call sites (`placeWayfindingSigns`'s exit-sign loop,
the main `entrances` build loop, and the lift's `entrances[0]` anchor)
now go through `entranceLocal()` instead of their own
`worldToLocal`+sign-of-`lz` pair. Since `station.entrances[]` is built
exclusively by `metro.js`'s `buildStation()`, and that function now always
publishes `dir`/`lz` on every entrance it pushes, the fallback branch is
currently dead code in practice — kept only as the documented safety net
the brief asked for.

**Not touched:** `buildCore()`'s own signature/semantics (`sign` still
means exactly what it meant before — which end of the ramp is street
level), `RUN_ENTRANCE`, `setPlatformDoors`/`platformDoorBays`/
`setPsdOpen`, the lift's adjacent-floor/ticket-gating logic from the prior
P11-P pass, or the entrance-shell riser geometry (that's `metro.js`'s
side, also unchanged in shape — only the sign feeding its direction
changed, and only for the case that was provably wrong).

**Stations reasoned through:** Mirpur 10 (4-leg — `en.dir`/`en.lz` are
now always present, so `entranceLocal()` takes the `en.dir`/`en.lz`
branch there too, not the fallback; since metro.js's `dir` for nonzero
`zc` is byte-identical to the old `zc < 0 ? -1 : 1`, and `lz`/`en.lz` for
Mirpur 10 are also identical up to the same floating-point noise that
used to exist — the only change there is which computation of an already-
agreeing value is used, not the value itself), Mirpur 11, Pallabi, and
Uttara South (all 2-leg — `entranceLocal()` now returns the `side`-sourced
`dir` from metro.js instead of a noise-sourced one, so each station's two
entrances get one `dir=-1` and one `dir=+1`, matching their shells by
construction rather than by luck).

**Not verified live:** walking into either entrance at Pallabi, Mirpur 11
or Uttara South and confirming `feetY` actually climbs 0 -> 8 into the
concourse, and that the wayfinding exit sign / lift anchor land in the
positions this fix now implies. Browser preview is the advisor's per this
session's standing rule.

## 2026-09-08 — P11-R: no changes needed here — confirmed, not assumed

Executor (Sonnet) worked to `docs/briefs/P11-R-ENTRANCES-INSIDE-BUILDINGS.md`
(entrances placed inside real buildings, both at Pallabi). Owner: `src/metro.js`
and `src/interior.js`. Only `src/metro.js` was actually touched — this entry
documents why `src/interior.js` did not need to be, checked by inspection
rather than assumed from the brief's "do not re-derive placement there" line.

**Why it doesn't need to change.** Every place in this file that reads an
entrance's position goes through `entranceLocal(station, en)` (P11-Q),
which takes `en.x`/`en.z` (world position, fed to `worldToLocal` for `lx`)
and prefers `en.lz`/`en.dir` when present over anything re-derived. metro.js
always publishes all four fields on every entrance it pushes. None of the
three call sites (`placeWayfindingSigns`'s exit-sign loop, the main
`entrances` build loop in `buildCore`'s caller, and the lift's
`entrances[0]` anchor) hardcode a station name, a specific `lz` value, or
an assumption that `lz` is 0 or +-24 — they all just consume whatever
`entranceLocal()` returns. Since P11-R only changes WHICH `(x, z, lz, dir)`
metro.js publishes per entrance, not the shape of the record or the
meaning of any field, every consumer here follows automatically.

**Checked specifically, not just asserted:** the lift's anchor
(`liftLx`/`liftLz`, around this file's own P11-P section above) reads
`entrances[0]` (entrance "A") generically —
`liftLz = elz - enSign * (RUN_ENTRANCE * 2 + 6)` — with no hardcoded
station Z. P11-R moved Mirpur 11's entrance A from local `lz=0` to
`lz=27` (the only entrance whose Z actually needed to move; see
`docs/METRO-REVIEW.md`'s matching dated section for the full table), which
also flips that entrance's `dir` from -1 (the `side`-sourced fallback used
when `zc` is exactly 0) to +1 (the `zc`-sign branch, now that `zc` is
genuinely nonzero) — both metro.js's shell and this file's lift anchor
compute off the SAME published `en.dir`, so they cannot disagree with each
other even though the value itself changed. Mirpur 11's lift will now sit
at concourse-local Z = 27 - 1*20 = 7 (previously 0-(-1)*20 = 20) — still
comfortably inside the +-30 m concourse span, still generic.

**A real defect this DID surface: the lift shaft clipping a portal column
at Mirpur 11.** Checking that hand-check rather than re-asserting it found
it was stale, not just untested: the original P11-P placement threaded
`liftLx` (only `PORTAL_COL_X + 0.5` = 0.5 m past the footpath edge) and
`liftLz` past every portal column with roughly 2 m to spare, by luck of
where the fixed formula happened to land, not because anything enforced
it. At Mirpur 11's new entrance-A position (`lz=27` instead of `0`), the
formula gives `liftLz = 27 - 1*20 = 7` — only 0.5 m from the portal column
at `z=7.5`. Because `liftLx` sits so close to the column's own X line
(0.5 m past it, versus the column's `PORTAL_COL_SIZE/2 + lift shaft's own
half-depth` reach of about 1.75 m), an X clash is essentially guaranteed
whenever a column lands this close in Z — the lift shaft would have stood
with a concrete column running straight through it.

**Fixed, not just flagged.** Added a small nudge right after `liftLz` is
computed (both the `entrances[0]`-anchored branch and the no-entrances
fallback): walk the same portal-column Z grid metro.js's `buildStation`
uses (`-halfL+7.5` to `halfL-7.5` step 15, `halfL = CONCOURSE_LEN/2`,
reading the grid's own size, `PORTAL_COL_SIZE`, off the now-exported
`METRO.PORTAL_COL_SIZE` — see this pass's matching entry in
`docs/METRO-REVIEW.md` — instead of hardcoding it a second time) and, if
`liftLz` lands within `shaftHalfD + PORTAL_COL_SIZE/2 + 0.3` m of any
column, push it to whichever side of that column needs the smaller move.
Verified by hand (not the browser): Mirpur 11's `liftLz` moves `7 -> 5.15`,
exactly `2.35` m from the `z=7.5` column (the clearance threshold itself),
and every other station's lift — none of which needed this pass's Z
search — lands comfortably outside the threshold already (nearest cases:
Mirpur 10 and Pallabi/Uttara South's unmoved entrance-A lifts sit
`>=2.5` m from their nearest column) and so the nudge is a no-op there,
confirmed by running the same arithmetic against each station's actual
numbers rather than assuming it.

**Not verified live:** that Mirpur 11's lift, at its nudged Z, still
clears its own entrance's stair-shell footprint (checked by hand: the
shell sits at local X -22.3..-16.7, the lift shaft at -15.35..-12.65 — no
X overlap regardless of Z, so this one is unaffected by the nudge) and
reads correctly on screen — this pass's whole verification is geometry
and arithmetic, no browser access. The advisor's live pass should include
Mirpur 11's lift specifically, not just the entrance doorways.

## 2026-09-08 — P11-T: escalator deck/guardrail rake re-verified, no change needed

Executor (Sonnet) worked to `docs/briefs/P11-T-ENTRANCE-SHELL-REBUILD.md`.
Owner: `src/interior.js` (this section) and `src/metro.js` (see
`docs/METRO-REVIEW.md`'s matching dated section for the shell-massing
rebuild, the main body of this pass). This entry documents why
`buildEscalatorDeck`/`buildGuardrail` did NOT need a functional change,
checked by direct computation rather than assumed innocent.

**Why this needed checking at all.** The brief flagged `buildEscalatorDeck`
and `buildGuardrail`'s `setFromUnitVectors(new THREE.Vector3(0,0,1), dir)`
rake as a suspected cause of the owner's "grey ramp projecting diagonally
out through a brick wall" screenshot, on the theory that a fixed-axis
`setFromUnitVectors` can have an undetermined roll when `dir` points the
other way (i.e. once entrances could face either direction along the
spine, per P11-Q's `dir: +-1`). The original author's own comment already
flagged they "could not check the sign by eye without a browser".

**Checked, not assumed.** Ran the actual rotation through `three`'s real
`Quaternion`/`Vector3` math (not eyeballed) for both signs of `rise`
(rise = `y1 - y0`, which flips sign with `sign`/`dir` per `buildCore`'s
`y0 = sign < 0 ? loY : hiY` / `y1 = sign < 0 ? hiY : loY`):

```
rise=+8, run=14: +Zend -> (x:0, y:+4.00, z:7)   -Zend -> (x:0, y:-4.00, z:-7)
rise=-8, run=14: +Zend -> (x:0, y:-4.00, z:7)   -Zend -> (x:0, y:+4.00, z:-7)
```

Two things fall out of this. First, `run` here is always `halfD*2`, a
magnitude — never negative — so `dir`'s Z-component is always positive,
meaning it is never anti-parallel to the source axis `(0,0,1)`, which is
the one condition (near-zero cross product) that actually makes
`setFromUnitVectors` ambiguous. Second, and more directly: for BOTH signs
of `rise`, the transformed geometry's local +Z endpoint lands at world-Y
offset `+rise/2` and its -Z endpoint at `-rise/2`, with the width axis
(the corner at `x=0.5`, checked alongside the endpoints) landing at
exactly `x=0.5` in both cases — no drift, no roll. Since `y1` (the higher
of the two levels) is by construction whichever end sits at local +Z
under this same `sign` convention (`rampLocal`/`walkable.ramp`'s own
documented contract: "height lerps y0 (at local -Z) to y1 (at local
+Z)"), the rake's high end and the ramp's actual high end agree for both
`sign` values, by construction — not by luck.

**Conclusion: this code was already correct for both `dir` values before
this pass.** The owner's "escalator ramp through a wall" screenshot is
fully explained by the OLD stepped entrance shell in `metro.js` (fixed in
this same pass — see `docs/METRO-REVIEW.md`'s P11-T section): a
finely-stepped stack of per-segment roof caps sized to their own
segment's far edge could, and did, leave the shell's headroom
inconsistent with the smooth linear rise the escalator/guardrail always
used, at various points along the run — no rake sign was ever wrong, the
enclosure around a correctly-raked escalator was. Since the entrance
shell is now a single true rake with a fixed `clearance` headroom
matching the escalator's own linear rise everywhere along the run (not
just at segment boundaries), this class of bug cannot recur even though
`buildEscalatorDeck`/`buildGuardrail` themselves are unchanged.

**No functional change made** to `buildEscalatorDeck` or `buildGuardrail`.
Added a doc comment above `buildGuardrail` recording this verification (the
concrete numbers above) so a future pass doesn't have to re-derive it from
scratch or re-flag it as unverified. `entranceLocal()`, `RUN_ENTRANCE`,
`buildCore`'s `y0`/`y1`/`sign` handling, and every exported signature are
all untouched.

**Stations/directions traced by hand:** Pallabi A (`dir=-1`, `rise` sign
resolves negative per `buildCore`) and Pallabi B (`dir=+1`, `rise`
positive) — both entrances of the station the brief specifically names —
plus Uttara South A/B (same `dir` pattern: A is always -1, B is always +1
at every 2-entrance station per P11-Q/P11-R's published values), using the
same two `rise` signs already covered by the `+-8` computation above (the
formula only depends on the sign of `rise`, not on which station/entrance
produces it, so the same two cases cover all four).

**Not verified live:** that the escalator deck and guardrails visually sit
flush inside the new raked shell at Pallabi and Uttara South, for both
entrances — that is the advisor's pass per this session's standing rule
against using the browser preview tools.

## 2026-09-08 — P11-S: lift now has a real floor at every stop; stair treads closed

Executor (Sonnet) worked to `docs/briefs/P11-S-LIFT-DELIVERS-TO-THIN-AIR.md`.
Owner: `src/interior.js` only (no `src/metro.js` change was needed). Not
verified live this pass — advisor does the visual check per this session's
standing rule against the browser preview tools; the numbers below were
verified by extracting the exact math into a standalone script and running
it against the real `src/walkable.js` (`createWalkableRegistry`), not by
re-deriving it by hand.

### Item 1 — the lift delivered the player to thin air at both upper stops

**Root cause, confirmed.** `buildLift`'s shaft sits at `liftLx = enSide *
(PORTAL_COL_X + 0.5)` = +-14.0 (P11-P's fix, correctly moving it clear of
the carriageway). Nothing registered a walkable surface there beyond
street level: the concourse slab stops at `CONCOURSE_W/2 = 13.5` (0.5 m
short of the shaft) and the platform deck stops at `platformOuter =
CANOPY_SPAN/2 - 0.3 = 10.7` (more than 3 m short). `state.liftTween` eases
`player.feetY` straight to 8.0 or 14.5 with nothing under the new
position; the very next frame's `supportHeightAt` call returns `null`,
gravity takes over, and the player falls back to the street — exactly the
owner's "goes up and player falls down" report.

**Fix — a real landing slab at every stop, added directly in `buildLift`.**
For both CONCOURSE_Y and DECK_Y, a new landing pad is registered:
anchored on the shaft's own footprint and extended toward the destination
floor far enough to overlap it by a genuine 1 m (not just touch its edge
— the brief was explicit that a shared-edge fix reproduces the exact 0.1 m
stair/escalator gap P11-A already had to fix once). The pad's Z half-depth
is the shaft's own halfD plus a 2 m apron, because `nearestInteractable`'s
range (9, hypot'd with a vertical term) lets the player trigger the lift
from several metres away, not only flush against the door — a pad sized
to just the shaft footprint would still drop a player who called the lift
from a few paces off. Visible floor geometry was added to match (existing
`concourseFloor`/`platformFloor` textures, so this reads as the same floor
as the rest of each level, not a patch).

**Probe results (`walkable.supportHeightAt`, run against the real
registry, not asserted):**
```
supportHeightAt(lift.x, lift.z, 0)     -> 0     (street — unchanged)
supportHeightAt(lift.x, lift.z, 8)     -> 8     (concourse — was null)
supportHeightAt(lift.x, lift.z, 14.5)  -> 14.5  (platform — was null)
```
Also checked the "walk off the bridge" case explicitly (acceptance #3):
standing on the platform's own deck at x=8 (`cur=14.5`) still resolves to
14.5, and standing on the concourse's own floor at x=10 (`cur=8`) still
resolves to 8 — the new pads overlap the existing slabs rather than
buffer up against them, so there is no null-support sliver at the seam
either direction.

**Item 3 — the hard case: the platform.** `platformOuter` (10.7) is more
than 3 m short of the shaft (14.0), so the lift cannot open directly onto
the deck. Chose **option (a), a link bridge** — real walkable slab,
visible floor, guard rail — over option (b) (drop the platform from the
stop list). Reasoning: the lift already reads as a real accessibility
route (a labelled HUD stop, landing doors built at all 3 floors per
P11-P); quietly making the platform unreachable by lift would contradict
that without the geometry actually forcing it — a 3.3 m bridge is cheap
next to the alternative of a lift that no longer does what its own doors
and label say it does. The bridge is a short corridor from the shaft
inward to 1 m past `platformOuter`, with a guard rail (collision-banded
wallLocal + two visible steel rail tubes, `buildBridgeRail`) on the three
edges that are open air — the far edge past the shaft and both long
sides — leaving only the edge that runs into the platform's own deck
open, since that one isn't a drop.

**Ticket gating (brief's hard requirement): untouched, still holds.** This
fix is geometry only. The only door onto the new platform bridge is
stepping out of the lift car at DECK_Y, and that step is still gated by
the exact same `state.hasTicket` check from P11-P section 2c — the action
callback refuses the trip and shows the AFC hint if the player has no
ticket, so the car never moves and the player is never placed on the
bridge. No new route from street to platform was created; the bridge only
extends what was already the *paid-side* upper stop.

**Also checked, not just assumed:** the lift's clear-of-carriageway
placement (`liftLx`/`liftLz`, P11-P/P11-R) is completely untouched — this
fix only adds walkable slabs and static geometry around the existing
shaft, never moves it. The adjacent-floor stop selection
(`liftTargetIdx`) and its ticket check are unmodified functions; item 1
only changes what floor exists under the player once they arrive.

**Not verified live:** riding the lift in the actual browser and standing
for 2 s at each stop (acceptance #2/#3) — confirmed instead by replaying
the exact landing-pad math against the real `walkable.js` registry
functions, which is what supportHeightAt itself will evaluate at runtime.
Also not checked live: whether the platform bridge's rail geometry clips
through the canopy columns at any station (the bridge sits well inboard
of the canopy edge per the numbers above, but this file's own header warns
visual clipping doesn't show up without the browser).

**Draw-call accounting:** the concourse landing floor and the guard rails
reuse the existing `concourseFloor`/`steel` bucket keys (every push under
one key merges into a single draw call, `createBucketer`), so those cost
nothing extra. The platform bridge's floor uses a new bucket key
(`platformFloor` — not previously used in this file; the visible platform
floor itself is metro.js's) — **+1 draw call per station**.

### Item 2 — see-through stair treads closed

`buildCore`'s tread loop baked each tread as an independent floating slab
(4% Z gap to its neighbour, nothing behind or under it), so every gap
between two treads was a sightline straight through the whole entrance
shell to daylight/road/shopfronts beyond — reading as a rendering fault,
not a staircase, and undercutting the enclosed shell P11-T just rebuilt.

**Fix.** Added a vertical riser box per step, closing the gap between
each tread and the one before it (and, for the first step, down to the
ramp's own start height). Each riser spans from the lower of the two
treads' bottom face to the higher one's top face (`Math.min`/`Math.max`,
not signed order, since `sign` can put `y1` on either side of `y0` —
i.e. this has to work for stairs climbing toward either +Z or -Z) so it
fully closes the step with a small margin at each end rather than exactly
matching it. Pushed into the *same* `'stairTread'` bucket key the treads
already use, per the brief's "whichever gives fewer draw calls" — since
every push under one key merges into a single mesh at flush time
(`createBucketer`), this costs **zero extra draw calls**, which also
made the riser-per-step approach strictly cheaper here than a second,
separately-keyed continuous soffit mesh would have been, while being
easier to guarantee gap-free at every discrete tread boundary (a single
smooth diagonal soffit would have needed extra thickness/margin to always
stay flush with the stepped, not perfectly linear, tread heights).

**Not changed:** the physical support surface (`rampLocal`, registered
before the tread loop, untouched) — per the brief, this is visual-only,
low-risk geometry.

**Not verified live** (acceptance #6, "no daylight or street geometry
visible between the treads looking up from the foot of the stair"): the
riser geometry is airtight by construction (checked the min/max span
covers every step boundary with margin, for both climb directions) but
this file's own header is explicit that visual bugs don't show up without
the browser — the advisor's live pass should include standing at the foot
of at least one entrance stair at each `dir` value.
