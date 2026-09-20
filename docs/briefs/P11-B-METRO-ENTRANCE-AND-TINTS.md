# P11-B — Metro: hollow out the entrance cores, un-blacken the canopy

**Owner (the ONLY file you may edit): `src/metro.js`.**
Do not touch src/interior.js, src/main.js, src/textures.js — other
executors own those this pass. Do not use the browser preview pane (shared
and currently throttled); the advisor verifies visually.

## What the owner reported
"There are no stairs. The stairs are not working. Many issues with the
metro thing."

## What the advisor found live (2026-09-07, dev server on :5183)

### 1. Each station entrance is a SOLID concrete block — no door, no stairs
In the entrances loop (~line 1002-1050) each entrance bakes:
```
bake('concrete', box(4.6, CONCOURSE_Y + 0.4, 5.6), [coreX, (CONCOURSE_Y+0.4)/2, zc]);
bake('brick',    box(4.3, CONCOURSE_Y - 0.6, 5.3), [coreX, (CONCOURSE_Y-0.6)/2 + 0.3, zc]);
```
That is a sealed 4.6 x 8.4 x 5.6 m block sitting on the footpath. There is
no opening of any kind. The advisor's ground-level screenshot at Mirpur 10
entrance D shows a blank dark box — this is literally the "there are no
stairs" report.

Meanwhile `src/interior.js` registers the walkable stair for that entrance
as a 14 m run **along the spine** (station-local Z), from the entrance foot
`lz` inward to `lz -+ 14`, at `lx = coreX - 1.15`. Verified live: the
player walks straight **through** your solid block (it carries no collision)
and the ramp does climb feetY 0 -> 8. So the mechanics work and the
architecture does not.

**Fix — make the visible core match the walkable stair:**
- Replace the solid block with a **hollow** core: four thin walls + a roof,
  open at the footpath end, so the player can see and walk into it. Keep
  the brick/concrete/banded language of the concourse box.
- The core must **enclose the stair run**, not sit beside it. The stair
  occupies station-local Z from `zc` to `zc -+ 14` (sign: toward the
  concourse centre) and local X `coreX-2.4 .. coreX+2.4`. Extend the core
  box along Z to cover that run, and slope its roof to follow the stair.
  interior.js owns everything inside; you own the shell.
- Cut a **doorway** in the footpath-facing end (roughly 3.0 m wide x 2.6 m
  high, centred on `coreX`), under the existing entrance fascia sign.
- Do NOT add collision geometry for the shell yourself — `ingestSceneColliders`
  in main.js and interior.js's own wall segments handle collision. If the
  shell would newly block the doorway, that is a bug; the doorway must stay
  walkable.

### 2. The platform canopy renders BLACK
`COL.canopyTop = 0x2f6b4a` is multiplied by `corrugated-metal/color.jpg`,
whose mean is 130,130,130 sRGB (~0.21 linear), then ACES tone-mapped. The
result is essentially black — see the advisor's aerial screenshot, where
both station canopies read as black voids in an otherwise sunlit city.

Measured colour-map means (sRGB) for the maps metro.js wires:

| slug | mean (r,g,b) |
|---|---|
| corrugated-metal | 130,130,130 |
| concrete-smooth-pale | 205,206,185 |
| brick-old | 138,110,87 |
| granite-dark-polished | 161,152,154 |
| steel-brushed | 147,148,152 |

**Fix:** the `COL` values are the *intended final* colours, so every tint
that is multiplied by a map must be pre-divided by that map's mean.
Affected: `canopyTop`, `canopyUnder`, `corrugatedGreen`, `platformFloor`,
`concrete`, `concreteDark`, `band`, `brick`, `psdFrame`. Leave the untextured
ones (`trussGrey`, `skylightGlass`, `green`, train colours) alone. Add a
comment recording the arithmetic and the measured means so a later pass
does not undo it.

### 3. Metals render black for the same reason as the interior
`scene.environment` is null (verified live). `MAT.galvanised` (metalness
0.7), `MAT.steel` (0.55), `MAT.psdFrame` (0.6) therefore have nothing to
reflect and go near-black. A separate executor is adding an environment
map, but your materials must look right with and without it: cap metalness
at **0.35** for `galvanised`/`steel`/`psdFrame` and raise their roughness
to compensate.

### 4. Shared-texture repeat clobbering (context only — do not "fix" here)
`loadTextureSet` caches ONE THREE.Texture per slug and hands the same
instance to every caller, and your `wireTexture` mutates `.repeat` on it.
interior.js shares `granite-dark-polished`, `steel-brushed` and
`concrete-smooth-pale` with you and instead bakes metric UVs, so your
`.repeat` silently rescales its tiling. **The textures.js executor is
fixing this by returning per-caller clones.** Do not work around it in
metro.js; just do not add new `.repeat` mutations.

## Acceptance (the advisor will check these live)
1. From the footpath at Mirpur 10 entrance D you can see INTO the entrance
   — a doorway, the stair going up, the roof over it. No sealed block.
2. From the air, both station canopies read as dark green corrugated roof
   with visible ribs and skylights, not as black voids.
3. Nothing on the platform or viaduct is pure black.
4. The car can still drive under the station (banded walls unchanged) and
   the walk from footpath -> stair -> concourse still works.
5. Draw calls per station do not grow by more than ~4 (keep the
   `bake`/`mergeBucket` pattern).
