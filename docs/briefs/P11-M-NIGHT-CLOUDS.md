# P11-M — Clouds are lit for midday at midnight

**Owner (the ONLY file you may edit): `src/sky.js`.**
A concurrent executor owns `src/night.js`; another session is working in
`src/signs.js` / `tools/build-scene.mjs` / `public/scene*.json`. Stay in
sky.js. Do NOT use the browser preview tools (shared, throttled); the
advisor verifies. Do not commit.

## Finding (advisor, live at night near Mirpur 10)
`buildClouds()` creates ONE `MeshBasicMaterial` with a white canvas puff
texture at `opacity: 0.72`, `fog: false`. `setTime()` re-tints everything
else in the sky for the time of day — dome uniforms, sun colour and
intensity, hemisphere ambient, fill light, fog colour/near/far, and
`renderer.toneMappingExposure` — but **never touches the cloud material**.

So the clouds render at full daylight white whatever the hour. Against the
near-black night dome they read as glowing grey blobs pasted on the sky,
and they are the brightest thing above the skyline in the night screenshot.
`MeshBasicMaterial` is unlit by design, so no amount of scene lighting will
ever fix this — it has to be driven from `setTime`.

## Fix
- Keep the one-material / one-InstancedMesh / one-draw-call design. That is
  a deliberate, documented budget decision in the file's own comment
  ("Deliberately cheap ... not worth the frame budget") — do not replace it
  with volumetric or shader clouds.
- Drive the cloud material's `color` and `opacity` from the active preset in
  `setTime()`. Night clouds should be a dim, desaturated version of the
  night sky's own palette (a touch lighter than the dome so they still read
  as cloud, not a black hole), and dusk/dawn clouds should pick up the warm
  horizon tint rather than staying neutral white — that is nearly free
  atmosphere for one lerp.
- Derive the values from each entry in `TIMES_OF_DAY` rather than
  hardcoding a night special case, so a future preset gets sensible clouds
  automatically. Adding a per-preset `cloudColor` / `cloudOpacity` (with a
  sane fallback computed from `horizon`/`haze` when absent) is the shape to
  aim for.
- Consider whether `fog: false` still earns its keep at night. It exists so
  clouds do not grey out at the horizon; check it does not also stop them
  settling into the night sky. If you change it, say why.

## Acceptance (the advisor will check live)
1. At `night`, clouds are visibly darker than the daytime version and do
   not read as glowing blobs; the brightest things in the sky are the
   lit windows and streetlights, not the clouds.
2. At `dusk` they pick up warm colour instead of staying white.
3. At `midday` they look the same as they do today — this must not be a
   regression in daylight.
4. Still one draw call for the whole cloud layer.

Append a dated section to `docs/HANDOFF.md` and report back with the
per-preset values you chose.
