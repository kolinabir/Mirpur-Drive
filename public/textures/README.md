# Swapping textures

Each material lives in its own folder here (`<slug>/color.jpg`, `normal.jpg`,
`roughness.jpg`, and optionally `ao.jpg`), all CC0 (see `LICENSES.md`) and
described in `MANIFEST.json`.

## To replace a material

1. Drop the new maps into `public/textures/<slug>/` using the same filenames
   (`color.jpg`, `normal.jpg` — OpenGL/+Y convention, `roughness.jpg`, `ao.jpg`).
   Keep them square, 1024px, JPEG quality ~80 so the facade atlas build stays fast
   and the bundle stays small.
2. Update the matching entry in `MANIFEST.json` (source URL, license, maps).
3. If it's a *new* slug rather than a replacement, add it to `MANIFEST.json`
   and reference it from whichever code needs it:
   - `src/textures.js` → `loadTextureSet('<slug>')` for any THREE.js material
     that wants real `map`/`normalMap`/`roughnessMap`/`aoMap` textures directly
     (SRGB color space is applied automatically to the color map only).
   - `src/facades.js` → the `CELL_MATERIALS` array assigns one slug per atlas
     cell (16 total, index 10 is the exposed-brick cell), and `ROOF_MATERIAL`
     picks the slug used for rooftop slabs.

## To add a whole new material

1. Pick a CC0 source — [ambientCG](https://ambientcg.com) is the primary one
   used here; [Poly Haven](https://polyhaven.com) is a good fallback.
2. Download the 1K-JPG set, keep Color/NormalGL/Roughness/AO, discard
   Displacement and any `.usdc`/`.blend`/`.mtlx` source files.
3. Resize to 1024px and re-encode as JPEG (`sips -Z 1024 -s format jpeg -s
   formatOptions 82 in.jpg --out out.jpg` on macOS) so each map stays well
   under ~500KB.
4. Save under `public/textures/<new-slug>/` and add an entry to
   `MANIFEST.json` + a source row in `LICENSES.md`.

## Notes

- `src/facades.js` tiles the color image directly onto the canvas atlas (no
  THREE texture involved there — it's baked into the atlas bitmap), then
  multiplies it with a palette colour (`globalCompositeOperation: 'multiply'`,
  ~0.75 alpha) so the same photo yields varied wall colours across the city,
  and finally draws windows/balconies/streaks on top.
- `src/textures.js` is for any *other* material in the scene (props, ground,
  metro viaduct, etc.) that wants full PBR maps applied as real THREE.js
  textures rather than baked into a canvas atlas.
- If an image fails to load (404, offline, etc.) both paths degrade
  gracefully: `facades.js` falls back to a flat tinted fill + procedural
  grain, and `textures.js` resolves the missing map as `undefined` instead of
  throwing.
