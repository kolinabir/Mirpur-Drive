# Mirpur Drive trailer

A 60-second trailer in two formats (16:9 and 9:16), built from **real game
footage** and edited in [Remotion](https://www.remotion.dev). It is its own
small project: nothing here is imported by the game, and the game's
dependencies stay `three` + `earcut`.

```bash
cd trailer
npm install
npm run game:build      # freeze a production build of the game into .cache/game
npm run capture -- all --format wide
npm run capture -- all --format tall
npm run music           # synthesize public/audio/music.wav
npm run vo              # synthesize public/audio/vo/*.wav (scratch voice-over)
npm run render          # out/mirpur-drive-trailer-16x9.mp4 and -9x16.mp4
npm run studio          # scrub the edit in Remotion Studio
```

Footage, frames, renders and the frozen game build are gitignored: they are
large and regenerable.

Disk: a full-quality capture writes ~2 MB per frame before it is encoded (the
frames of a shot are deleted once its clip exists), and each Remotion render
keeps ~1.5 GB of frames in `$TMPDIR/react-motion-render*` until it finishes.
An interrupted render leaves that folder behind, and `pkill -f "remotion render"`
can miss the worker processes: check `ps` and `$TMPDIR` before starting again.

## How the footage is captured

Screen recording drops frames whenever the GPU is busy. `capture/` avoids real
time altogether, **without touching any game file**:

- `virtual-time.js` is injected before the game boots. After `__vt.takeover()`
  the page's `performance.now()`, `Date.now()` and `requestAnimationFrame` only
  advance when the harness calls `__vt.step()`, exactly 1/60 s per step. Both of
  the game's loops (`src/main.js`, `src/drive.js`) see a perfect 60 fps however
  long a frame takes. `Math.random` is seeded per shot.
- `page-shots.js` scripts the camera through the documented debug hooks
  (`window.__mirpur`, `window.__driveDebug`): free-fly dollies and orbits,
  a pure-pursuit driver that holds a lane on the corridor with the real car
  physics, train tracking, time of day, monsoon. It hides the on-foot name
  pills, which are gameplay UI.
- `shots.js` is the shot list as code. `capture.mjs` steps each shot, POSTs a
  JPEG of the WebGL canvas per frame to a local endpoint, and encodes with the
  ffmpeg that ships inside Remotion (no system ffmpeg needed).
- Frames are rendered at 1.5x (2880x1620 / 1620x2880, MSAA on) and scaled to
  1080p at encode time. Chrome runs headed so WebGL uses the real GPU.
- The harness serves a **frozen build** (`npm run game:build`), never the Vite
  dev server: this checkout is shared, and any file change reloads a dev page
  mid-take.

Shot-design tools: `serve.mjs` keeps one game session open, `eval.mjs` and
`scout.mjs` poke it and save stills, `capture.mjs --preview --attach` simulates
a whole shot but keeps one frame a second, `contact.mjs` makes a contact sheet.
The `Sheet` composition renders a frame grid of any captured clip:

```bash
npx remotion still Sheet out/sheet.jpg --props='{"src":"drive-chase","format":"tall","every":60,"cells":8,"cols":8}'
```

Two things the game does that the capture works around (see `shots.js`):
the opening cinematic is ~19 s and blocks the time-of-day key while it runs,
and at eye height on a station platform a soft pale patch appears on the floor
just ahead of the camera (framed out with a lens shift in 16:9, cropped in 9:16).

## The edit

`src/timeline.ts` is the whole cut: clips, in-points, big words, lower thirds.
60 fps at 120 BPM, so a beat is 30 frames and every cut lands on one.
Bangla strings are copied from the game source, not translated here.
See [docs/SHOTLIST.md](docs/SHOTLIST.md).

## Audio, and what to replace

- **Music** (`capture/music-page.js`) is synthesized with Web Audio for the same
  reason the game's audio is: nothing to license. Drop any licensed track over
  `public/audio/music.wav`; keep 120 BPM with hits at 12 s, 42 s and 52 s and
  the cuts stay on the beat.
- **Voice-over** is a scratch track from Kokoro-82M (open weights, Apache-2.0)
  via `kokoro-js`; the first run downloads the ~90 MB model. A real Dhaka voice
  will sell this better: record each line of `src/script.json` over
  `public/audio/vo/NN.wav`, then `npm run vo -- --measure` to refresh the
  durations that drive the captions and the music ducking.
- 9:16 burns in captions (most views there are muted); 16:9 does not. Flip the
  `captions` prop per composition in `src/Root.tsx` or from the CLI.

## Licence note

Remotion is free for individuals and companies of up to three people; larger
companies need a Remotion company licence. Everything in `capture/` is
independent of Remotion apart from borrowing its bundled ffmpeg.
