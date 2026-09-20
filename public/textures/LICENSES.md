# Texture licenses

All textures in this directory are sourced from [ambientCG](https://ambientcg.com), which
releases every asset under **CC0 1.0 Universal** (public domain dedication — no attribution
required, free for commercial use, modification and redistribution).

Maps were downloaded at 1K-JPG resolution, then re-encoded to 1024px JPEG (quality ~70-82,
sips) to keep the shipped bundle small. Only the Color, NormalGL (OpenGL normal, +Y up),
Roughness and (where available) AmbientOcclusion maps were kept; Displacement/height and the
`.usdc`/`.blend`/`.mtlx` source files were discarded.

| Slug | ambientCG asset | Source page |
|---|---|---|
| plaster-weathered-1 | Plaster007 | https://ambientcg.com/a/Plaster007 |
| plaster-weathered-2 | PaintedPlaster017 | https://ambientcg.com/a/PaintedPlaster017 |
| concrete-stained-1 | Concrete036 | https://ambientcg.com/a/Concrete036 |
| concrete-stained-2 | Concrete044D | https://ambientcg.com/a/Concrete044D |
| brick-old | Bricks094 | https://ambientcg.com/a/Bricks094 |
| corrugated-metal | CorrugatedSteel009 | https://ambientcg.com/a/CorrugatedSteel009 |
| asphalt-patched | Road012B | https://ambientcg.com/a/Road012B |
| paving-bricks | PavingStones142 | https://ambientcg.com/a/PavingStones142 |
| dirt-ground | Ground107 | https://ambientcg.com/a/Ground107 |
| rust-metal | Metal022 | https://ambientcg.com/a/Metal022 |
| concrete-smooth-pale | Concrete046 | https://ambientcg.com/a/Concrete046 |
| granite-dark-polished | Granite005A | https://ambientcg.com/a/Granite005A |
| tiles-light-stone | Tiles078 | https://ambientcg.com/a/Tiles078 |
| steel-brushed | Metal009 | https://ambientcg.com/a/Metal009 |
| aluminium-brushed | Metal051C | https://ambientcg.com/a/Metal051C |
| panel-cream | Concrete046 (second copy) | https://ambientcg.com/a/Concrete046 |
| plaster-painted-grey | PaintedPlaster009 | https://ambientcg.com/a/PaintedPlaster009 |
| tiles-ceramic-small | Tiles022 | https://ambientcg.com/a/Tiles022 |
| plaster-white-clean | PaintedPlaster014 | https://ambientcg.com/a/PaintedPlaster014 |
| plaster-white-aged | PaintedPlaster015 | https://ambientcg.com/a/PaintedPlaster015 |

`plaster-painted-grey` and `tiles-ceramic-small` were added in the P9-PALLABI pass for the
Pallabi metro station area: the former provides a pale painted-render surface (tinted to blue-grey
or cream via `WALL_PALETTE`); the latter provides small glazed ceramic tile cladding for
commercial/institutional buildings near the station (OWNER-STREETVIEW-2026-09-07.md §L3).

`plaster-white-clean` (PaintedPlaster014) and `plaster-white-aged` (PaintedPlaster015) were added
for the Uttara South planned sector zone: providing clean, lighter painted-render finishes typical of
newer planned residential sectors in Dhaka (OWNER-RESEARCH-2026-09-09).

No Poly Haven fallback was needed — ambientCG covered every requested category.

See `MANIFEST.json` in this directory for the machine-readable map paths used by
`src/textures.js` and `src/facades.js`.
