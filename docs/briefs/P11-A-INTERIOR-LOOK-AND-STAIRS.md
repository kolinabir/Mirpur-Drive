# P11-A — Station interior: stop the black slabs, make the stairs visible

**Owner (the ONLY files you may edit): `src/interior.js`.**
Do not touch src/metro.js, src/main.js, src/textures.js, src/player.js —
other executors own those this pass. Do not use the browser preview pane
(it is shared and currently hidden/throttled); the advisor verifies
visually. Report what you changed and why.

## What the owner reported
"The texture of the metro inside is not the same, and there are no stairs.
The stairs are not working."

## What the advisor found live (2026-09-07, dev server on :5183)

### 1. Every `steel` surface inside the station renders as a solid BLACK slab
`TEXTURE_SPECS.steel` sets `metalness: 0.9`. The scene has **no
`scene.environment`** (verified: `scene.environment === null`), so a
MeshStandardMaterial with metalness ~0.9 has almost nothing to reflect and
renders near-black under ACES tone mapping. Confirmed by live experiment:
forcing `metalness = 0.2` on every interior material turned the platform
from an unreadable black box into a legible station in one frame.

`texMat('steel')` is used for:
- the two flanking screen panels on EVERY stair core,
- the platform-edge PSD barrier (0.1 x 1.5 x 180 m, both platforms),
- the AFC gate paddles,
- the lift box.

So the black slabs are most of what the player sees inside.

**Fix:** drop `TEXTURE_SPECS.steel.metalness` to **0.25** and raise
`roughness` to ~0.45. A separate executor is adding `scene.environment`;
your material must look right *both* with and without it, so do not rely
on the env map arriving.

### 2. Tint x albedo double-darkening
The `tint` values in `TEXTURE_SPECS` were chosen as the *final* look, then
get multiplied by a photographic albedo whose mean is ~0.5 sRGB (~0.2
linear), then tone-mapped. Measured means of the colour maps:

| slug | mean sRGB (r,g,b) |
|---|---|
| granite-dark-polished | 161,152,154 |
| tiles-light-stone | 156,134,117 |
| panel-cream | 205,206,185 |
| aluminium-brushed | 242,243,242 |
| steel-brushed | 147,148,152 |

`platformFloor` / `stairTread` tint `0x4f5250` x a 0.6-grey map = near
black — the platform floor currently reads as tarmac, not polished granite.

**Fix:** brighten each tint so `tint x mapMean` lands on the intended
colour. Concretely: divide each tint channel by the map's mean/255 and
clamp to 0xff. Add a short comment block recording the arithmetic so the
next pass does not "helpfully" darken them back. Intended final looks
(from docs/TEXTURES-METRO.md, unchanged): concourse floor light
grey-cream, platform floor dark polished grey (dark, but the speckle must
be visible — not black), walls cream, ceiling light brushed aluminium.

### 3. The stairs are invisible — this is the "there are no stairs" report
`buildCore()` pushes two flanking "screen panels" per core:
```
pushBox(bucket,'steel', ..., 0.15, hiY-loY+2.2, halfD*2+2, coreX -+ 2.4, panelY, centerZ, ...)
```
For an entrance core that is **0.15 x 10.2 x 16 m** — a pair of opaque
walls, in the metalness-0.9 black steel above, standing on both sides of
the stair for its whole run. From the street you see a black wall; the
granite treads behind it are never visible. The advisor's screenshot from
the footpath shows exactly this.

**Fix:**
- Make the flanking screens read as the perforated screens they are meant
  to be: keep the collision (the `wallLocal` segments at `coreX +- 2.4`
  are load-bearing — they stop the player falling into the void beside the
  narrow ramp; **do not remove them**), but replace the solid full-height
  box with an open balustrade: a solid kick panel from the stair line up
  to ~1.1 m plus a handrail tube, leaving everything above open. The
  player must be able to SEE the stair treads from the street and from
  the concourse.
- Add a visible **handrail** (two tubes, ~0.9 m and ~1.0 m above the ramp
  line, following the ramp slope) on both sides of the stair, and one
  between stair and escalator. Currently there is none.
- Give the escalator ramp visible geometry: it is registered as a moving
  walkable surface but has NO mesh at all — the player rides an invisible
  escalator. Add a sloped deck, a balustrade, and a moving-looking
  comb/step pattern (static geometry is fine).

### 4. Stair treads sit 1.15 m off the entrance centreline
`stairX = coreX - 1.15`, `escX = coreX + 0.55`, and there is a **0.1 m
gap** between the stair ramp's +X edge (coreX+(-1.15+1.1) = coreX-0.05)
and the escalator's -X edge (coreX+0.05). `supportHeightAt` returns `null`
in that sliver, so a player walking exactly up the core centreline falls.
**Fix:** overlap them (widen the stair ramp to halfW 1.15 or shift escX to
+0.5) so there is no null-support sliver anywhere between them.

### 5. Lift box is half underground
`buildLift` pushes a 2.0 x 2.3 x 2.2 box at **y = 0**, so half of it is
below the street. It also only exists at street level — there is no shaft,
and nothing visible at concourse or platform level, though the interaction
stops at all three. **Fix:** sit the street car on the ground (`y = 1.15`),
and add a visible glazed shaft running 0 -> DECK_Y with a car-sized
opening at each of the three stops.

## Acceptance (the advisor will check these live)
1. Standing on the footpath at Mirpur 10 entrance D, the stair treads and
   handrails are visible going up into the station. No black slab.
2. Standing on either platform, nothing in view is pure black; the PSD
   line reads as frame + glass, the floor as dark speckled granite.
3. Walking W from the street up the stair core still climbs feetY 0 -> 8
   (it does today — do not regress it), and the 0.1 m null sliver at the
   core centreline is gone.
4. Draw-call count per station interior does not grow by more than ~4
   (keep using the `bucket` merger; do not add per-fixture meshes).
