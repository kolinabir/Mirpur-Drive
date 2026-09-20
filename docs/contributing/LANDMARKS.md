# Landmarks, signage & reference photos

This is where local knowledge counts most. The generic city is procedural;
the places people recognise are modelled by hand, in code, from reference.

## Existing hand-modelled places

| Place | File |
|---|---|
| Pallabi / Mirpur 12 frontage, BFC & KFC tower, South Point, Regal plaza | `src/landmarks.js` |
| Sher-e-Bangla National Cricket Stadium | `src/stadium.js` |
| Mirpur 10 foot over bridge | `src/mirpur10-bridge.js` |
| Benarasi Palli gate and saree shopfronts | `src/benarasi-palli.js` |
| Jatiya Sangsad Bhaban | `src/sangsad.js` |
| MRT Line 6 viaduct, stations, trains | `src/metro.js`, `src/interior.js`, `src/traininterior.js` |
| Shop-sign grammar and real-name sign atlas | `src/signs.js` |

Each has a written observation file under `reference/<place>/` that the
model was built from. Read the one nearest your target first to see the
expected level of detail.

## Proposing or building a landmark

1. **Open an issue** naming the place, with its OpenStreetMap link.
2. **Write the observations down** in `reference/<place>/OBSERVATIONS.md`:
   storeys, bay count, colours, sign text and position, what is at street
   level, what you could *not* verify. This file is the durable output — the
   model is built from it, and the next person corrects it.
3. **Model it in its own `src/<place>.js`**, exporting a build function that
   `src/main.js` calls. Reuse the shared materials and the texture sets in
   `src/textures.js`; merge static geometry so a landmark costs a handful of
   draw calls, not hundreds (`docs/DRAWCALLS.md`).
4. If a generic OSM building sits where your landmark goes, exclude that
   footprint rather than overlapping it (see `docs/briefs/P12-B-EXCLUDE-AND-GATE.md`).
5. Add it to the teleport menu catalogue in `src/districts.js` so people can
   find it with `O`.

## Signs and real business names

Real shop names are reproduced as **plain text** in the sign's real colours.
Do not redraw proprietary logo artwork, do not add slogans that aren't on the
real sign, and do not put a real person's name, face or private phone number
into the world. Bangla text is welcome and preferred where the real sign is
in Bangla — check it renders un-mirrored from both sides of the street.

## Reference photos

**What may be committed** to `reference/`:

- Wikimedia Commons images under CC0 / CC BY / CC BY-SA, with a row in that
  folder's `CREDITS.md` (file, source page, author, licence).
- **Your own photographs**, if you state in the PR that you took them and
  release them under CC BY 4.0 or CC0. Please avoid identifiable faces and
  number plates, or blur them.

**What may never be committed** (look at it, write down what you learned,
link to it):

- Google Street View / Google Maps imagery.
- Mapillary frames (record the image key and contributor instead).
- News, blog, forum or social-media photos.

If you need such images on disk while modelling, keep them in a `refonly/`
folder — those are git-ignored by `reference/.gitignore`, and only the
`SOURCES.md` provenance list inside them is tracked.

No reference image is ever used as a texture, baked into an atlas, or copied
into `public/`. See `reference/README.md`.
