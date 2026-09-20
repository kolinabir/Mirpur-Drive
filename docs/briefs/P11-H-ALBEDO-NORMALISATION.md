# P11-H — Fix the tint overshoot properly: normalise the albedo maps

**Owner: `src/textures.js`, `src/metro.js`, `src/interior.js`.**
Do not touch src/main.js, src/signs.js, src/traffic.js (other executors).
Do NOT use the browser preview tools (shared, throttled); the advisor
verifies. Do not commit.

## What happened
P11-B and P11-A fixed a real bug — the station was rendering near-black
because tints chosen as the *final* colour were being multiplied by a
mid-grey photographic albedo (mean ~0.5 sRGB) and then ACES tone-mapped.
The fix applied was to **pre-divide each tint** by its map's mean.

That overshoots, and the advisor has confirmed it live:

| material | intended | shipped now | result on screen |
|---|---|---|---|
| `metro.js` `canopyTop` | `#2f6b4a` dark green | `#5cd291` | pale mint, not DMTCL green |
| `metro.js` `canopyUnder` | `#8a8d8a` mid grey | clipped `#ffffff` | white/silver barn roof |
| `metro.js` `brick` | `#a0523a` | `#ffbeaa` | salmon-pink, hue shifted |
| `interior.js` `concourseFloor`, `wall`, `steel` | various | all clipped `#ffffff` | washed-out white concourse |
| `interior.js` `platformFloor` | `#4f5250` dark granite | `#7d8a84` | light grey, not polished dark stone |

Two things went wrong with pre-division:
1. **It clips.** Any tint brighter than the map's mean saturates at
   `0xff`, and it clips per channel — which is why brick's red pinned and
   the hue swung to salmon. Once clipped, the intended colour is
   unrecoverable.
2. **It is done in sRGB space** against a value that multiplies in linear
   space after tone mapping, so even where it does not clip the result is
   not the intended colour.

The station now reads noticeably brighter than the city around it (see the
aerial: the canopy is the lightest thing in frame, and it should be one of
the darkest).

## The right fix: normalise the map, keep the tint honest
A photographic albedo should supply **variation**, not overall level. Fix
it once, at the source, instead of hand-tuning every tint:

### 1. `src/textures.js` — add albedo normalisation
Add an option (e.g. `loadTextureSet(name, { normalise: true })`) that
returns a colour map whose mean has been scaled to near-white, so
`tint x map` lands on `tint` with the photo's detail riding on top.
- Draw the decoded image to a canvas, compute the per-channel mean, scale
  every pixel by `target / mean` (target around 0.88-0.92 of full white —
  leave headroom so bright speckle does not clip), write it back as a
  `CanvasTexture`.
- Clamp per channel, and **preserve hue**: scale by a single luminance
  factor rather than three independent per-channel factors, otherwise you
  reintroduce the hue shift this brief exists to fix.
- Cache normalised variants separately from raw ones — key the cache on
  `slug + variant`. Keep the existing one-fetch-per-slug behaviour and the
  per-caller `clone()` isolation from P11-C intact; both are verified
  correct and must not regress.
- Normal/roughness/AO maps must NOT be normalised — colour map only.
- Normalisation must not block first paint: keep the current behaviour
  where materials start flat-tinted and gain the map when it resolves.

### 2. `src/metro.js` — revert the tints, request normalised maps
Restore every `COL` entry to its documented intended value (they are
recorded in the file's own comments and in docs/TEXTURES-METRO.md — the
owner's own hexes: `canopyTop #2f6b4a`, `canopyUnder #8a8d8a`,
`brick #a0523a`, `platformFloor #4f5250`, `concrete #c9c7bd`, etc.), delete
the `predivideTint()` machinery, and have `wireTexture` ask for the
normalised colour map. Keep the P11-B metalness caps (0.35) — those were
correct and are not in question here.

### 3. `src/interior.js` — same
Restore `TEXTURE_SPECS` tints to their documented intended values, delete
the pre-division comment block and arithmetic, request normalised maps.
Keep the P11-A metalness/roughness change to `steel` (0.25 / 0.45) — also
correct and not in question.

## Watch out for
- `scene3.environment` now exists (a RoomEnvironment PMREM at
  `environmentIntensity` 0.35 day / 0.12 night), so materials get more
  fill light than they did when the original tints were chosen. Expect the
  restored tints to look *slightly* lighter than the pure-hex swatch —
  that is correct and desirable. Do not compensate by darkening the tints;
  if something still looks wrong after normalisation, report it rather
  than hand-tuning a hex back out of spec.
- Do not touch `renderer.toneMapping`, exposure, or light intensities.

## Acceptance (the advisor will check live)
1. The platform canopy reads as **dark green corrugated roof** from the
   air — one of the darker things in frame, not the lightest.
2. The concourse walls read as cream panels, not blown-out white.
3. The platform floor reads as dark polished granite with visible speckle.
4. Station brick matches the brick language of the concourse box — no
   salmon/pink cast.
5. Nothing has gone back to black: no surface in the station interior is
   crushed to near-zero.
6. Draw calls and FPS unchanged.

When done, append dated sections to `docs/TEXTURES-METRO.md` (the
normalisation approach and why pre-division was replaced),
`docs/METRO-REVIEW.md` and `docs/INTERIOR-PASS.md`. Report back to me with
the final tint values and the normalisation target you chose.
