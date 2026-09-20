# Mirpur facade upgrade — 19 September 2026

## Coverage and behavior

The shared city renderer covers Pallabi, Mirpur 11 and Mirpur 10. Mirpur's pool expands from 12 to 24 deterministic facade variants; Uttara retains its separate palette and expands from four to eight. Each building independently selects its upper facade, ground-floor shopfront and subtle vertex tint. Window spacing and balcony columns vary across the atlas.

Photographic ambientCG surfaces already licensed in `public/textures/LICENSES.md` remain the source. The facade atlas now includes aligned normal and roughness maps; brick/plaster no longer borrow one unrelated concrete normal map, and windows/glass have a flatter, smoother response. Distant buildings omit the normal map. No additional wall meshes, triangles, material groups or draw calls are introduced. Existing tile streaming, collisions and building footprints are unchanged.

## Assets

`npm run textures:bake` builds five PNG fallbacks and KTX2 textures under `public/textures/facades/`, and copies Three.js's Basis transcoder to `public/basis/`. The generator runs offline using `@napi-rs/canvas`; Basis encoding is capped at four threads. Runtime transcoding uses two workers. Generated assets must accompany source changes; the ordinary app build does not rebake them.

- Color/emissive: 2048 × 4096, ETC1S, sRGB.
- Normal: 1024 × 2048, UASTC, linear.
- Roughness: 512 × 1024, UASTC, linear.
- Roof color: 256 × 256, ETC1S, sRGB.
- Compressed files total 1,811,143 bytes (1.73 MiB), excluding the shared transcoder.
- Every texture includes a full mip chain. Eight-pixel cell gutters reduce filtering bleed.
- The baker flips rows once; runtime KTX2 and PNG paths both use `flipY=false`.
- PNG fallback loads only if compressed loading fails. Its GPU memory cost is higher.

These are artist-generated facade combinations, not exact photographic replicas of individual buildings. Actual protruding balconies and other additional 3D facade geometry are outside this texture pass.

## Validation

- Offline bake completed, including all source maps, mip chains and transcoder files.
- `npm run build` passed; existing >500 kB chunk warning remains.
- `node --check` passed for the changed JS modules and baker; `git diff --check` passed.
- `npm run lint` and `npm run typecheck` were attempted; neither script exists in this JavaScript repository.
- Browser coverage and observed FPS are recorded below. Spot readings do not establish sustained performance or physical-phone acceptance.

## Manual check

1. Reload the local app, start exploring, and skip the introduction.
2. Press **1** for Pallabi, **2** for Mirpur 11 and **5** for Mirpur 10. Wait for the camera transition and streamed buildings to settle.
3. Walk toward several facades: compare brick, plaster, glass, balcony layouts, shopfronts and neighboring building tints. Check storefronts stay at ground level and textures face upright.
4. Press **T** through afternoon/dusk/night. Check lit windows align with the facade and do not illuminate adjacent atlas cells.
5. Drive the same route in each area at the same viewport and graphics settings. Compare frame times and stutters on the target devices before claiming a sustained FPS guarantee.

### Desktop browser observations

At the final Pallabi spawn: **60 FPS, 220 draws, 992k triangles**. Mirpur 11 street view: **60 FPS, 379 draws, 1,064k triangles**. Both displayed upright facades with distinct material/window/shopfront combinations. Earlier baseline spot readings were 51 FPS at Pallabi and 54 FPS at Mirpur 11, but traffic, streaming and concurrent unrelated workspace changes make those unsuitable as a controlled speedup claim.

Mirpur 10 midday: **60 FPS, 216 draws, 1,009k triangles**. Mirpur 10 night: **58 FPS, 292 draws, 1,039k triangles**; emissive windows align with the facade and shopfront tiles. No browser warning/error entries were captured in the final preview. Night adds the existing streetlight/traffic rendering work; there is no controlled pre-change night measurement. Physical mobile and sustained driving benchmarks remain unverified.
