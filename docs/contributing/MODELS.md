# 3D model contributions

Almost everything in the world — buildings, the viaduct, stations, the
stadium, signs, street furniture — is **built procedurally in code**, not
loaded from model files. The only loaded models today are the vehicles in
`public/models/car-kit/` (Kenney Car Kit, CC0). Before adding a model file,
ask whether the thing is better expressed as code: see
[LANDMARKS.md](LANDMARKS.md).

## When a model file is the right answer

Organic or intricate shapes that are miserable to build from boxes and
extrusions and that appear many times: a rickshaw, a CNG auto-rickshaw, a
double-decker BRTC bus, a Dhaka-style truck, a cha-stall kettle. The street
is still short of **local vehicles** — that is the most wanted model
contribution.

## Requirements

- **Licence:** CC0, or CC-BY if you are the author and say so. Made by you or
  from a clearly licensed pack. No Sketchfab rips, no models extracted from
  other games. `docs/CAR-MODEL-HUNT.md` records what was already searched and
  why most "free" car models were rejected.
- **Format:** binary glTF (`.glb`), metres, Y-up.
- **Budget:** aim for under ~5k triangles and ~200 KB per vehicle, one
  material, one small shared texture. Traffic draws dozens at once.
- **Structure:** for anything drivable, wheels must be **separate nodes**
  (named so left/right, front/back are identifiable), not welded to the body
  — `src/drive.js` reparents them onto its own steering and spin pivots.
- **Orientation:** this repo's forward is `-Z`. If your model faces `+Z`
  (Kenney's do), that is fine, but say so; see the notes in
  `public/models/LICENSES.md` and `src/models.js`.

## Checklist for a model PR

1. File under `public/models/<pack-or-author>/`.
2. Row in `public/models/LICENSES.md`: file, source URL, author, licence,
   date fetched, plus any node-layout quirks you found.
3. Loaded through `src/models.js` (shared loader and cache) — do not create a
   second `GLTFLoader`.
4. Screenshot on the street next to an existing car for scale, and the FPS
   counter before/after with traffic on screen.
