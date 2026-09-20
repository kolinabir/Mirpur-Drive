# Contributing to Mirpur Drive

Thanks for wanting to help build Mirpur. This is a hobby reconstruction of a
real place, so the most valuable contributions are the ones that make it
**more like the real street** — and you do not need to write code for most
of them. If you live in or travel through Mirpur, you already know things
this project doesn't.

## Pick your lane

| I want to… | Read |
|---|---|
| Fix a wrong road, building, height or station, or add a new area | [docs/contributing/MAP.md](docs/contributing/MAP.md) |
| Add or replace a wall, road or ground material | [docs/contributing/TEXTURES.md](docs/contributing/TEXTURES.md) |
| Add a vehicle or another 3D model | [docs/contributing/MODELS.md](docs/contributing/MODELS.md) |
| Model a real building, sign or landmark, or share reference photos | [docs/contributing/LANDMARKS.md](docs/contributing/LANDMARKS.md) |
| Work on gameplay, rendering, performance, UI or mobile | [docs/contributing/CODE.md](docs/contributing/CODE.md) |
| Report a bug or "this doesn't look like the real place" | [Open an issue](../../issues/new/choose) |

## Setup

```bash
npm install
npm run dev
```

Node 20+. There is no backend, no account, no API key and no environment
variables — if a change needs one, it probably doesn't belong here.

## The three rules that apply to everything

1. **Real beats plausible.** If something exists in Mirpur, model what is
   actually there, and say how you know (your own photo, an OpenStreetMap
   tag, a Wikimedia Commons image). Don't invent a generic version of a real
   thing.
2. **Only redistributable assets get committed.** Everything that ships in
   `public/` must be CC0 or similarly free *and* recorded in the matching
   `LICENSES.md`. News photos, Google Street View captures, Mapillary frames
   and anything "found on the web" may be *looked at* but never committed —
   see [LANDMARKS.md](docs/contributing/LANDMARKS.md#reference-photos).
3. **It has to stay fast.** The whole 4+ km map runs in a browser tab on a
   mid-range laptop and on phones. Watch draw calls, texture memory and first
   load; say in the PR what you measured (the in-game FPS counter is enough).

## Pull requests

- One topic per PR. A map fix and a shader change are two PRs.
- Branch from `main`, and run `npm run build` before pushing — it must pass.
- Add a screenshot or short clip for anything visible. Before/after is ideal.
- Note what you did **not** verify. An honest "only checked on desktop
  Chrome" is far more useful than silence.
- Regenerated data files (`public/scene*.json`, `public/map-overview.json`,
  the facade atlas) go in the same PR as the change that caused them, with
  the exact command you ran.
- By contributing you agree that your code is released under the
  [MIT License](LICENSE), and that any asset you add is under the licence you
  state for it.

## Conduct

Be kind, assume good faith, and keep it about the work. Mirpur is a real
neighbourhood with real people, businesses and politics: no mockery of
either, no real people's faces or private details in the game, and nothing
partisan. Maintainers may remove anything that breaks this.
