# Texture contributions

The step-by-step mechanics (file names, sizes, where a slug is referenced)
live next to the files in
[`public/textures/README.md`](../../public/textures/README.md). This page is
the contribution policy around them.

## What is accepted

- **CC0 only.** [ambientCG](https://ambientcg.com) is the primary source,
  [Poly Haven](https://polyhaven.com) the fallback. Your own photographs are
  welcome if you release them as CC0 in the PR.
- **Never** a photo of a real Mirpur facade pulled from the web, Street View
  or a news site, even as "just a wall". Reference photos inform a material
  choice; they are not the material.
- Textures that look like **Dhaka**: weathered painted plaster, stained
  concrete, exposed brick, tin, tiled fronts, patched asphalt, dusty ground.
  Pristine Western brick or suburban siding will be declined however nice it
  is.

## Format

| Map | File | Notes |
|---|---|---|
| Colour | `color.jpg` | sRGB, 1024 px square |
| Normal | `normal.jpg` | OpenGL convention (+Y up) — ambientCG's `NormalGL` |
| Roughness | `roughness.jpg` | |
| Ambient occlusion | `ao.jpg` | optional |

JPEG quality ~80, each map well under ~500 KB. Drop displacement maps and
any `.blend` / `.usdc` / `.mtlx` sources.

## Checklist for a texture PR

1. Files in `public/textures/<slug>/`.
2. Entry in `public/textures/MANIFEST.json` (source URL, licence, maps,
   suggested use).
3. Source row in `public/textures/LICENSES.md`.
4. Wired up where it is used:
   - a wall/roof material in the facade atlas → `CELL_MATERIALS` /
     `ROOF_MATERIAL` in `src/facades.js`, then **re-bake the atlas** with
     `npm run textures:bake` and commit the regenerated
     `public/textures/facades/*.png` and `*.ktx2`;
   - any other surface → `loadTextureSet('<slug>')` from `src/textures.js`.
5. Before/after screenshots in daylight **and** at night — several materials
   only show problems under the streetlights.

## Albedo matters

Colour maps that are too bright or too saturated blow out at noon and glow at
night. New colour maps should sit in the same brightness range as the
existing set; `docs/briefs/P11-H-ALBEDO-NORMALISATION.md` explains how the
current ones were normalised and why.

## Size budget

Every texture is downloaded by every player, including on mobile data.
Replacing a material is cheap; adding one needs a reason. If you add a slug,
say in the PR what it is for and how many kilobytes it costs.
