# P1-E7: metro interior + pier texture sourcing (2026-09-07)

Owner complaint fixed: the metro station interior and the piers looked
"weird colours" because the piers used a warm mottled concrete
(concrete-stained-1 / Concrete036) and the interior had flat palette
colours with no textures at all. This pass adds 6 new CC0 texture sets
from ambientCG, matched against the owner's photo transcription in
`reference/metro/OWNER-PHOTOS-2026-09-07.md` (P6-P12, and the second/third
photo batches).

All maps downloaded 1K-JPG via `https://ambientcg.com/get?file=<AssetId>_1K-JPG.zip`,
re-encoded to 1024px JPEG quality 78 with `sips` (matches the existing
convention in this directory), Color/NormalGL/Roughness kept, Displacement
and the `.blend`/`.usdc`/`.mtlx` source files discarded. None of the chosen
assets shipped an AmbientOcclusion map (loader in `src/textures.js`
tolerates a missing map, resolves to `undefined`).

## Decisions

### concrete-smooth-pale -> Concrete046
Target: pier/girder — "smooth pale grey cast concrete, faint form lines,
light streaks" (owner photos Q6-Q9, P4/P5).
- **Concrete046 (chosen)**: pale cream-grey, faint vertical form lines and
  light streaking visible in the color map — the closest match to the
  owner's description of the viaduct deck.
- Concrete016 (rejected): medium blue-grey, too dark/cool, mottled cloud
  pattern with no form lines.
- Concrete030 (rejected): dark brownish-grey, reads as aged/dirty concrete,
  too dark for "pale".
- Concrete014 (rejected): medium grey with dark mottled speckle, closer to
  a stained wall than smooth cast concrete.

Recommended tint `#C9C7BD`, repeat 3 m (per brief). Also reused for the
metro piers/girders/parapets in place of concrete-stained-1.

### granite-dark-polished -> Granite005A
Target: platform floor — "dark grey polished granite tiles, slight
speckle, reflective" (P6/P7, Q1-Q5).
- **Granite005A (chosen)**: coolest, most neutral grey-lavender speckle of
  the granite candidates, fine even grain, no strong directional pattern —
  best base to tint dark and make reflective (roughness map) in-engine.
- Granite001A (rejected): warm tan/brown speckle, wrong hue family.
- Granite003A (rejected): warm brownish-grey, lighter and more textured
  than "polished".
- Granite007A (rejected): dark olive-brown speckle, too warm.
- Tiles015 (rejected): a black/grey **checkerboard** pattern with visible
  grout lines baked into the map — would tile as an obvious repeating grid
  at 0.6 m and doesn't read as continuous polished stone.

Recommended tint `#4F5250` (owner's own hex from the second photo batch),
repeat 0.6 m.

### tiles-light-stone -> Tiles078
Target: concourse floor — "light grey/cream large stone tiles,
matte-satin" (P8-P12).
- **Tiles078 (chosen)**: mottled marble-like stone with no repeating grid
  or strong two-tone pattern, reads as a continuous matte-satin stone
  slab — tint shifts it from its native warm tan toward the target cream.
- Tiles074 (rejected): black/tan **checkerboard**, strongly patterned.
- Tiles076 (rejected): black/tan geometric key/maze pattern, strongly
  patterned.
- Tiles082 (rejected): black-and-cream **chevron** pattern with dark green
  marble inlay — striking but nothing like the plain concourse floor in
  the photos.
- Concrete048 (runner-up, not used): plain warm-grey linear streaks, a
  reasonable backup but reads more like brushed concrete than a stone
  tile; Tiles078's mottled grain is a better match for "stone".

Recommended tint `#EDEAE4`, repeat 0.8 m.

### steel-brushed -> Metal009
Target: PSDs, handrails, lift doors, gates — "brushed stainless".
- **Metal009 (chosen)**: clean, fine, uniform horizontal brush grain on a
  neutral grey base — the clearest "brushed stainless" read of the three.
- Metal010 (rejected): brushed grain present but blotchy/patchy with
  darker mottled patches, less uniform than true brushed stainless.
- Metal012 (rejected): nearly flat pale blue-white, no visible brush
  striations — reads as painted metal, not brushed.

Recommended tint `#C9CDCE`, repeat 1 m.

### aluminium-brushed -> Metal051C
Target: strip ceiling baffles, escalator cladding — lighter brushed
aluminium.
- **Metal051C (chosen)**: visible directional brushed streaking on a
  light base — keeps the brushed-metal read once lit, unlike the
  alternative.
- Metal051A (rejected): almost completely flat white/featureless: with no
  visible grain it would look like flat plastic once tinted and lit,
  rather than brushed aluminium.

Recommended tint `#E4E6E6`, repeat 1 m.

### panel-cream -> Concrete046 (second copy)
Target: concourse wall panels — "smooth cream large-format panels,
near-uniform" (P8-P12). Per the brief this is allowed to reuse one of the
concrete-smooth-pale candidates since the cream tint is applied in code.
Concrete046 was preferred over Concrete016 for the same reason as above
(paler, has the faint horizontal banding that reads as panel joints at a
1024px tile, unlike Concrete016's colder mottled cloud pattern).

Recommended tint `#EDEAE4`, repeat 0.8 m (matches tiles-light-stone tint
family so the concourse reads as one consistent light material).

## Tint / repeat summary table

| slug | assetId | tint hex | repeat (m) |
|---|---|---|---|
| concrete-smooth-pale | Concrete046 | #C9C7BD | 3 |
| granite-dark-polished | Granite005A | #4F5250 | 0.6 |
| tiles-light-stone | Tiles078 | #EDEAE4 | 0.8 |
| steel-brushed | Metal009 | #C9CDCE | 1 |
| aluminium-brushed | Metal051C | #E4E6E6 | 1 |
| panel-cream | Concrete046 | #EDEAE4 | 0.8 |

## Size budget

Total added under `public/textures/`: **4.3 MB** (6 folders x 3 maps each,
color/normal/roughness re-encoded at 1024px q78), well within the 20 MB
brief limit. Per-folder sizes:

- concrete-smooth-pale: 784 KB
- granite-dark-polished: 1.2 MB
- tiles-light-stone: 568 KB
- steel-brushed: 560 KB
- aluminium-brushed: 428 KB
- panel-cream: 784 KB

## Verification

- `node -e 'JSON.parse(require("fs").readFileSync("public/textures/MANIFEST.json"))'`
  -> parsed with no error.
- `curl -sI http://localhost:5183/textures/<slug>/color.jpg` for all 6 new
  slugs -> `HTTP/1.1 200 OK`, `Content-Type: image/jpeg` for every one
  (concrete-smooth-pale, granite-dark-polished, tiles-light-stone,
  steel-brushed, aluminium-brushed, panel-cream).

## Not done / handoff notes

- No src/ edits were made (out of fence for this brief). The interior and
  metro executors still need to wire these new slugs into their material
  assignments (replacing the flat palette colours and the
  concrete-stained-1 usage on piers/girders) and apply the tint/repeat
  values above.
- No browser tab was used, per the brief (curl checks only).

## 2026-09-07 — P11-H: replace pre-division with albedo normalisation

Implemented `docs/briefs/P11-H-ALBEDO-NORMALISATION.md`, editing
`src/textures.js`, `src/metro.js`, `src/interior.js`. The advisor verified
live that P11-B/P11-A's fix (pre-dividing each intended tint by its map's
measured mean) overshot: it clips per channel (brick's red channel pinned,
shifting the hue to salmon-pink) and, even unclipped, the division was done
in sRGB against a mean that actually multiplies in linear space after ACES
tone mapping, so the result wasn't the intended colour either way. The
station ended up reading brighter than the surrounding city — the canopy
was the lightest thing in the aerial screenshot instead of one of the
darkest.

**Fix, at the source:** `src/textures.js` now exposes
`loadTextureSet(name, { normalise: true })`. When `normalise` is set, the
returned colour map has its mean scaled toward white using a **single
luminance-derived factor** applied uniformly to R/G/B (never per channel —
per-channel scaling is exactly what changes hue/channel ratios and is what
this brief exists to undo):

1. Draw the decoded `<img>` onto an offscreen canvas, read `ImageData`.
2. Compute per-channel means, combine into one perceptual luminance
   (`0.2126*meanR + 0.7152*meanG + 0.0722*meanB`).
3. `factor = (0.9 * 255) / meanLuminance` — target mean is 90% of full
   white, leaving headroom so bright speckle in the photo doesn't clip.
4. Multiply every pixel's R, G, B by that one `factor` (clamped to 255);
   alpha untouched. Write back via `putImageData`, wrap the canvas in a new
   `THREE.CanvasTexture` copying `wrapS/wrapT/anisotropy/colorSpace` from
   the source texture.

Normal/roughness/AO maps are never normalised — only the colour map carries
overall level; the others encode geometry/microsurface detail that must
stay exactly as shot.

**Caching:** the normalised variant is computed once per slug (not once per
caller) in a cache keyed `` `${slug}::normalised` ``, separate from the
existing raw-decode cache (`rawCache`, keyed by bare slug). `loadTextureSet`
still hands every caller its own `clone()` of whichever map it asked for
(normalised or raw) before returning — the P11-C per-caller `.repeat`/
`.offset` isolation (metro.js tiles a shared slug via `.repeat.set()`;
interior.js uses the same slug with baked metric UVs expecting
`repeat=(1,1)`) is unchanged and still correct; this pass only added a
second cache dimension, not a new sharing mode.

**metro.js / interior.js:** `predivideTint()` and the measured-mean tables
deleted; every `COL` / `TEXTURE_SPECS` tint restored to the owner's
documented intended hex (no arithmetic):

| material | tint |
|---|---|
| `metro.js` `canopyTop` | `#2f6b4a` |
| `metro.js` `canopyUnder` | `#8a8d8a` |
| `metro.js` `brick` | `#a0523a` |
| `metro.js` `concrete` / `concreteDark` / `band` | `#c9c7bd` / `#b7b4a9` / `#d8d3c6` |
| `metro.js` `corrugatedGreen` | `#2f8f5b` |
| `metro.js` `psdFrame` | `#c9cdce` |
| `metro.js` `platformFloor` | `#4f5250` |
| `interior.js` `concourseFloor` / `wall` | `#edeae4` |
| `interior.js` `ceiling` | `#e4e6e6` |
| `interior.js` `platformFloor` / `stairTread` | `#4f5250` |
| `interior.js` `steel` | `#c9cdce` |

Both files' `wireTexture`/`texMat` now call `loadTextureSet(slug,
{ normalise: true })`. P11-B's metalness caps (metro.js, 0.35) and P11-A's
steel metalness/roughness (interior.js, 0.25/0.45) are untouched — correct,
not in question this pass.

Normalisation target: **0.9** (90% of full white) — chosen per the brief's
0.88-0.92 suggested range, leaving ~10% headroom before clipping so a
photo's brightest speckle doesn't pin white immediately.

Not verified visually this pass (browser pane shared/throttled with the
advisor, per the brief's constraint) — `node --check` passes on all three
files; the advisor verifies live against the brief's Acceptance section.
