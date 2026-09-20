# P11-C — Scene environment map + per-caller texture clones

**Owner (the ONLY files you may edit): `src/main.js`, `src/textures.js`.**
Do not touch src/metro.js or src/interior.js — other executors own those
this pass. Do not use the browser preview pane (shared and currently
throttled); the advisor verifies visually.

## Finding 1: `scene.environment` is null, so every metal is black
Verified live: `window.__mirpur.scene.environment === null`, and the scene
is lit only by a DirectionalLight (1.75), a HemisphereLight (0.9) and an
AmbientLight (0.35), with `ACESFilmicToneMapping`. Any
MeshStandardMaterial with meaningful `metalness` therefore has nothing to
reflect and renders near-black. In the metro station that is the
platform-edge screens, the AFC gates, the lift, the masts and the
handrails — the owner's report that "the texture of the metro inside is
not the same" is largely this.

**Fix in `src/main.js`:** build a PMREM environment and assign it to
`scene3.environment`.
- Prefer generating it from the existing `Sky` (src/sky.js owns the sky
  dome and the sun; `new Sky(scene3, renderer)` is created at main.js:260)
  via `THREE.PMREMGenerator.fromScene(...)` so the reflection matches the
  actual time of day; if that turns out to need changes inside sky.js
  (which you do NOT own), fall back to
  `three/addons/environments/RoomEnvironment.js`.
- Regenerate at most a few times per day/night cycle, NOT per frame —
  `PMREMGenerator.fromScene` is expensive. Regenerating when the sky's
  time-of-day bucket changes (or every ~10 s, whichever is simpler and
  cheap) is fine. Dispose the previous render target each time.
- Set `scene3.environmentIntensity` (three r0.180 supports it) to about
  0.35 so the env fills in metals without washing out the daylight look.
- `src/night.js` (createNight, main.js:261) drives the day/night lighting —
  the environment must dim with it. You may read from night/sky but do not
  edit those files; if you need a hook they do not expose, say so in your
  report instead of editing them.

Guard rails: FPS at Mirpur 10 is currently ~24-28 with ~175-242 draw
calls. Do not make it worse. Do not change `toneMapping`, exposure or the
existing light intensities — two other executors are re-tinting materials
against the current lighting this pass, and moving the lighting under them
would invalidate their work.

## Finding 2: `loadTextureSet` hands the SAME Texture instance to everyone
`setCache` in src/textures.js caches one Promise per slug and every caller
gets the same `THREE.Texture` objects. `src/metro.js#wireTexture` then does
`set.map.repeat.set(r, r)` on them, while `src/interior.js#texMat` uses the
same slugs with baked metric UVs and expects `repeat = (1,1)`. Three slugs
are shared this way — `granite-dark-polished`, `steel-brushed`,
`concrete-smooth-pale` — so the interior's granite and steel are silently
tiled at metro.js's repeat and do not match. There is a long comment in
metro.js acknowledging this as a known limitation; fix it properly here.

**Fix in `src/textures.js`:** keep the network/decode cache exactly as it
is (one fetch per slug), but return a **per-call clone** of each texture so
a caller mutating `.repeat`/`.offset` cannot affect any other caller.
- `THREE.Texture.prototype.clone()` shares the underlying `image`, so this
  costs no extra memory or bandwidth — but each clone needs
  `needsUpdate = true` once so it gets its own GPU upload, and the clone
  must carry over `wrapS/wrapT/anisotropy/colorSpace`.
- Keep `preloadAll()` working.
- Both existing callers must keep working unchanged: metro.js's
  `wireTexture` (mutates `.repeat`) and interior.js's `texMat` (does not).

## Acceptance (the advisor will check these live)
1. `window.__mirpur.scene.environment` is a Texture after load.
2. The station platform's steel/PSD surfaces are legibly grey, not black,
   and the effect dims at night.
3. `loadTextureSet('steel-brushed')` called twice returns two different
   Texture objects sharing one `image`, and setting `.repeat` on one does
   not change the other.
4. FPS and draw calls at Mirpur 10 are no worse than before.
