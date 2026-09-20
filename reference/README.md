# Reference material

Visual and factual reference for modelling. Only imagery that is licensed for
redistribution (Wikimedia Commons, with attribution) is committed. Anything
gathered from the wider web lives in a `refonly/` folder, which is
git-ignored (see `reference/.gitignore`): only its provenance list is tracked.

## Folders

- `metro/photos/` — Wikimedia Commons photos of the viaduct, both stations
  and the trains. CC BY / CC BY-SA / CC0. Attribution in `photos/CREDITS.md`.
- `metro/interior/photos/` — Wikimedia Commons photos of station interiors,
  same licensing, attribution in that folder's `CREDITS.md`.
- `metro/interior/refonly/` — imagery gathered from the wider web (news
  galleries, blogs, forums) purely as modelling reference. **Not committed**
  (not licensed for redistribution); only the provenance list,
  `refonly/SOURCES.md`, is tracked so the images can be re-found.

## The one rule

These images inform geometry, proportion and colour. They are **not shipping
assets**: never use one as a texture, never bake one into an atlas, never
copy one into `public/`. Everything the game actually ships comes from the
CC0 set in `public/textures/`, which is cleared for redistribution.

The durable output of all this reference is the written specs, which are what
a developer should build from:

- `metro/SPEC.md` (and its ADDENDUM, which overrides the estimates above it)
- `metro/interior/SPEC-INTERIOR.md`
- `metro/interior/OBSERVATIONS.md`
