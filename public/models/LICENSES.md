# Model licenses

All models in this directory are sourced from [Kenney](https://kenney.nl), which releases
every asset under **CC0 1.0 Universal** (public domain dedication — no attribution required,
free for commercial use, modification and redistribution).

Downloaded as the GLB-format export of the pack (glTF binary, single embedded geometry
buffer + one external colormap texture per model, referenced by relative path from the
`.glb` file — kept as-is, not re-encoded).

| File | Source pack | Source URL | Author | Licence | Fetched |
|---|---|---|---|---|---|
| `car-kit/*.glb` (10 vehicles, 3 wheel variants) + `car-kit/Textures/colormap.png` | Kenney Car Kit (v3.1) | https://kenney.nl/assets/car-kit | Kenney (www.kenney.nl) | CC0 1.0 | 2026-09-07 |

A subset of the 45-asset Car Kit pack is kept — the road vehicles that make sense on a
Dhaka street (sedans, SUVs, hatchback, taxi, van, delivery vans, truck) and their wheels;
debris, karts and tractors were dropped. About 2 MB in total. The pack's own
`car-kit/Kenney-License.txt` is kept alongside.

## Node/mesh layout (`car-kit/sedan.glb`)

Five nodes, five meshes, one shared material (`colormap`) — 5 draw calls including wheels:

- `body` — the car shell.
- `wheel-front-left`, `wheel-front-right`, `wheel-back-left`, `wheel-back-right` — separate
  nodes already, not welded to the body, so `src/drive.js` reparents them onto its own
  steer/spin pivots directly (no bounding-box splitting needed).

The glTF node *names* (`wheel-front-left` etc.) turned out not to reliably indicate which
way the **body mesh's own geometry** faces — verified empirically by rendering it plain: the
body mesh's hood sits at local `+Z`. This repo's convention is forward = `-Z` (see
`src/drive.js`'s `forwardOf()`), so `src/drive.js`'s `buildModelCarMesh()` rotates the
extracted body mesh 180° about Y after pulling it out of the loaded scene (the wheel meshes
are re-centred onto this repo's own pivots regardless of their source transform, so they
did not need the same fix). See the comment on `bodyMesh.rotation.set(...)` in
`src/drive.js` and the note in `src/models.js`.
