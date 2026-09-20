# P11-L — Night streetlights: the lamps are lighting the ground from below

**Owner (the ONLY file you may edit): `src/night.js`.**
You may READ src/streets.js, src/metro.js, src/sky.js, src/main.js but
must not write to them. Do NOT use the browser preview tools (shared,
throttled); the advisor verifies. Do not commit.

## Owner report
"Night street light has issues, doesn't look good."

## Root cause — measured live by the advisor

`findLampWorldPositions()` reads the lamp-head InstancedMesh and takes each
instance's world position with `setFromMatrixPosition(m)`. But the lamp head
geometry has its **height baked into the geometry**, not into the instance
matrix. Measured on the live scene, under `street-furniture`:

| instanced mesh | count | geometry bbox Y | size (x,y,z) |
|---|---|---|---|
| pole | 2716 | 0.00 – 9.00 | 0.26, 9.00, 0.30 |
| arm | 2716 | 8.94 – 9.06 | 1.90, 0.11, 0.11 |
| **head (this is the one picked)** | 2716 | **8.80 – 9.00** | 0.72, 0.20, 0.34 |
| pole (2nd family) | 5766 | 0.00 – 8.50 | 0.40, 8.50, 0.40 |
| arm (2nd family) | 5766 | 7.55 – 7.65 | 1.50, 0.10, 0.10 |

The head instances carry only X/Z, so every entry in `lampPositions` comes
back with **y = 0** (verified: the glow Points geometry's Y attribute is
0.00 for all 2716 points, min 0, max 0).

Two consequences, both visible on screen:

1. **Every lamp-head glow sprite renders at ground level.** The 34-unit
   additive `Points` sprites sit on the road instead of 9 m up on the lamp
   head. On screen this reads as big blurry fog-like smears lying on the
   tarmac and at the base of shopfronts, while the actual lamp heads stay
   completely dark. This is the "doesn't look good".
2. **Every dynamic point light is 1.2 m underground.** `reassignLights()`
   does `light.position.set(p.x, p.y - 1.2, p.z)` — clearly intended as
   "just below the lamp head" — but with `p.y = 0` that puts all 24 lights
   at **y = -1.2**, under the ground plane. Verified live: all 24 lit
   lights report `y: -1.2`. Their intensity 35 / radius 28 m is entirely
   wasted below the road, so the street itself is pitch black.

## Fix

1. In `findLampWorldPositions()`, add the geometry's own baked height to
   each instance position — e.g. take the head geometry's bounding-box
   centre Y and add it to the vector from `setFromMatrixPosition`. Do not
   hardcode 9.0; read it from the geometry so it survives a change in
   streets.js (which you do not own). Return true world head positions.
2. Then `reassignLights`'s existing `p.y - 1.2` lands correctly just under
   the head, and the glow Points sit at the head. Re-check both: the glow
   should read as a lamp head glowing, not as a patch on the road.
3. Sanity-check the resulting look and retune if needed: with the lights
   finally above ground, `LIGHT_INTENSITY = 35` at `LIGHT_RADIUS = 28` may
   now be far too hot, and the ground pools (`CircleGeometry(7)`,
   `opacity 0.45 * factor`) may double up with real illumination. Aim for
   pooled lamplight along the road with dark between, not a uniformly lit
   street and not the current black.

## Second finding — two thirds of the lamps are never lit
The head detector accepts the first InstancedMesh matching
`size.x > 0.4 && size.x < 1.2 && size.y 0.08..0.4 && size.z 0.15..0.6`, and
stops at the first hit (`if (headMesh || !obj.isInstancedMesh) return;`).
That matches only the 2716-lamp family. The second family (5766 lamps, arm
at y ~7.6) has `size.x = 1.5`, which fails the `< 1.2` test — so **5766 of
the 8482 street lamps in the scene emit no glow and get no light at all**,
even after fix 1.

Collect **all** matching head/arm meshes rather than the first one, widen
the size test to admit the second family (without admitting benches,
bollards or signboards — check what else lives under `street-furniture`
before loosening it), and pool the positions. Keep `MAX_DYNAMIC_LIGHTS` at
24 — the nearest-N reassignment already bounds the real light cost; only
the cheap instanced glow/pool count grows.

## Also seen at night, lower priority — report, do not fix here
- The cloud layer renders bright grey at night, as if still lit by day.
  That is `src/sky.js`, which you do not own.
- The minimap stays a bright white daytime map, which is jarring at night
  and hurts dark adaptation. That is `src/minimap.js`, not yours.
Mention both in your report so the advisor can brief them separately.

## Acceptance (the advisor will check live)
1. `night-lamp-glow` geometry Y values are at real lamp-head height
   (~7.6 and ~9.0), not 0.
2. All 24 dynamic point lights sit above ground, just under a lamp head.
3. Standing on the road at night near Mirpur 10, the lamp heads visibly
   glow and throw pools of light on the road beneath them; the road is not
   pitch black, and there are no glowing smears lying on the tarmac.
4. Both lamp families light up.
5. FPS no worse (~65 fps / 217 draws at this spot tonight).

Append a dated section to `docs/HANDOFF.md`. Report back with what you
changed, the head heights you found, and any retuning of intensity/pools.
