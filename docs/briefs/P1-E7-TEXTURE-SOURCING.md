# P1-E7: source CC0 textures that match the owner's metro photos

Owner files: `public/textures/**` (new subfolders), `public/textures/
MANIFEST.json`, `public/textures/LICENSES.md`. Docs: `docs/TEXTURES-METRO.md`
(create). NO src/ edits; the interior and metro executors apply them later.
Read: docs/briefs/P0-COMMON.md, reference/metro/OWNER-PHOTOS-2026-09-07.md
(P6-P12, second and third batch sections), public/textures/MANIFEST.json
(format to extend), src/textures.js (loader expects color/normal/
roughness/ao jpg per slug folder).

Owner complaint: the metro station interior and the piers look "weird
colours" because the piers use a warm mottled concrete (Concrete036) and
the interior uses flat palette colours with no textures.

Download from ambientCG (CC0), 1K JPG: URL pattern
`https://ambientcg.com/get?file=<AssetId>_1K-JPG.zip` (curl -L, unzip,
keep only *_Color.jpg -> color.jpg, *_NormalGL.jpg -> normal.jpg,
*_Roughness.jpg -> roughness.jpg, *_AmbientOcclusion.jpg -> ao.jpg;
delete the rest). For each target, download the candidates, READ each
color.jpg with the Read tool, compare against the photo description, keep
the best ONE, delete the others, and say why in docs/TEXTURES-METRO.md.

| slug to create | what the photos show | candidates (assetId) |
|---|---|---|
| concrete-smooth-pale | pier/girder: smooth pale grey cast concrete, faint form lines, light streaks | Concrete046, Concrete016, Concrete030, Concrete014 |
| granite-dark-polished | platform floor: dark grey polished granite tiles, slight speckle, reflective | Granite001A, Granite003A, Granite005A, Granite007A, Tiles015 |
| tiles-light-stone | concourse floor: light grey/cream large stone tiles, matte-satin | Tiles074, Tiles076, Tiles078, Tiles082, Concrete048 |
| steel-brushed | PSDs, handrails, lift doors, gates: brushed stainless | Metal009, Metal010, Metal012 |
| aluminium-brushed | strip ceiling, escalator cladding | Metal051A, Metal051C |
| panel-cream | concourse wall panels: smooth cream large-format panels, near-uniform | Concrete046 or Concrete016 (a second copy is fine, the tint is applied in code) |

Also record for each slug the recommended `color` tint hex and world
repeat (metres per tile) so the applying executor can copy it:
granite 0.6 m tiles, concourse tiles 0.8 m, concrete 3 m, steel 1 m.
Total added size must stay under 20 MB. Add every asset to MANIFEST.json
in the existing format and to LICENSES.md (CC0, ambientcg.com/a/<id>).
Verify: `node -e 'JSON.parse(require("fs").readFileSync("public/textures/MANIFEST.json"))'`
and `curl -sI http://localhost:5183/textures/<slug>/color.jpg` returns
200 image/jpeg for every new slug. No browser tab needed.
