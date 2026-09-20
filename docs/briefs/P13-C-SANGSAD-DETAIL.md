# P13-C — Make the Parliament as detailed as it deserves

**You own: `src/sangsad.js` and `tools/smoke-sangsad.mjs`. Nothing else.**
Do NOT touch `src/main.js`, `src/minimap.js`, `index.html`, `src/city.js`
or the scene files — three other executors are in them. Do not commit.
Do not use browser preview tools; the advisor verifies and screenshots.

## Where it stands

`src/sangsad.js` already builds Jatiya Sangsad Bhaban from the REAL OSM
rings (177-point outer ring, 14 light courts, the assembly-chamber block).
Read its header first — it states exactly what is measured data and what is
interpretation, and that distinction must survive your changes.

The advisor looked at it live from Manik Mia Avenue. It is recognisably the
building, and these are the specific defects:

1. **It reads as one flat dark grey mass.** The white marble banding — the
   single most recognisable thing about the exterior after the geometry —
   does not show at all at street distance. The concrete texture's
   board-form grid reads instead, like a panel joint pattern it does not
   have.
2. **The openings are too small.** Kahn's are enormous — a circle fills
   most of its bay. Ours look like windows punched in a wall.
3. **The crown reads as a lumpy box**, not as an octagonal drum with a ring
   of clerestory fins. From the south it barely separates from the mass.
4. **The south plaza is a 250 m dark grey slab** dominating the foreground
   and reading as tarmac. The real approach is lawn and water with a
   controlled paved axis, not an airfield.
5. No entrance. The south face has no portico, no doors, no scale cues —
   nothing that says how big it is.

## What to do

Fix 1-5. Beyond that, add detail that pays off at the distances a player
actually sees this from (across Manik Mia Avenue, from the lake edge, and
from the metro viaduct):

- Deep reveals in the openings, so the screen wall reads as ~1 m of
  concrete with shadow inside, not as a decal.
- The recessed glazing set well behind each opening.
- A proper podium edge and the approach stair, at human scale.
- The lake edge and its retaining wall on the north/west sides. The scene
  already ships the real water polygons (`Cresent Lake`, `Shangsad bhaban
  Lake`) — read them from the scene rather than inventing a shape, the
  same way the building rings are read.
- Keep it inside a sane triangle budget. It is currently ~6.8k triangles;
  up to ~40k is fine for the national parliament. Say what you ended at.

## Rules that are not negotiable

- **Do not move, round or "improve" the OSM geometry.** Everything real
  stays real; everything you add is interpretation and must be marked as
  such in the header's list, which you must keep accurate.
- No copyrighted source material. Work from the building as publicly and
  famously known — its massing, its primary geometry, its materials. Do
  not reproduce measured drawings.
- `node tools/smoke-sangsad.mjs` must still pass (no NaN, no failed
  merge). Extend it if you add new meshes worth checking. Run it and paste
  the output in your write-up.
- The `buildSangsad(scene)` signature and its return shape
  (`{group, colliders, stats, setNightIntensity}`) are a contract with
  main.js — do not change them. You may add fields.

Write up what you changed, and what still looks wrong, in
`docs/SANGSAD.md` (new file).
