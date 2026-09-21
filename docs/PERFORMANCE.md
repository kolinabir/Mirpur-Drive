# Performance guidelines

For people and for AI agents. Read this before adding anything the player can
see, and before "optimizing" anything.

**The target:** a steady 60 fps (16.6 ms a frame) on an integrated-graphics
laptop and on a mid-range Android phone, with the whole 4+ km map loaded.
Most players are in Bangladesh, on exactly those machines. A feature that only
runs well on the machine it was written on is not finished.

The measured history is in `docs/PERF-PASS-*.md`. This file is the distilled
version: what we learned is expensive here, how to measure, and what "done"
means.

## The one fact to keep in your head

**This game is GPU fill-rate bound, not CPU or triangle bound.**
(`docs/PERF-PASS-2026-09-20.md`.) On the reference machine all JS systems
together cost about 3 ms and three.js's draw submission about 3 ms; the rest
is the GPU shading pixels. A view with 916k triangles rendered in 2.9 ms while
a street with a quarter of that took 30 ms, because of how many pixels were
shaded and how many times.

So, in order of how much they usually matter here:

1. **Pixels shaded** (resolution, MSAA, overdraw, transparent layers,
   expensive fragment shaders).
2. **Stalls** (a 40 ms hitch is worse than a permanent 2 ms: tile builds,
   canvas redraws, shader compiles, anything done "once" on the main thread
   while the player is moving).
3. **CPU per frame on a slow core** (the M-series number times 4 to 6).
4. **Draw calls.**
5. **Triangles.** Least important, and the first thing everyone reaches for.

## Rules

### Pixels

- **No new full-screen or full-ground transparent layer** without a measured
  cost and a tier that removes it. The monsoon's wet sheet is the cautionary
  example: one alpha plane over the ground is +10% GPU on its own.
- **No per-pixel procedural noise.** Four hashes and three mixes per octave,
  per pixel, per frame adds up on a phone. Bake it into a small tileable
  texture and fetch it (`noiseTexture()` in `src/monsoon.js`).
- **Gate fragment work by distance.** Detail that is under a pixel (ripples
  past 32 m, a 9 cm pole past 170 m) should not be computed or drawn.
- **Cap sprite sizes.** An uncapped `gl_PointSize` turns one particle near the
  lens into a screen-sized alpha quad.
- **Never write `smoothstep(a, b, x)` with `a > b`.** It is undefined in GLSL
  and breaks on some mobile drivers. Use `1.0 - smoothstep(b, a, x)`.
- **DOM over the canvas counts.** `mix-blend-mode`, `backdrop-filter` and
  animated full-screen layers make the compositor read the WebGL frame back.
  Use plain opacity, and drop the layer on `pointer: coarse`.
- Resolution and MSAA are owned by `src/perf-governor.js`. Do not set the
  pixel ratio anywhere else.

### Geometry and draw calls

- **Repeated thing = `InstancedMesh`; static thing = merged mesh.** One mesh
  per prop is never acceptable.
- **A map-wide InstancedMesh cannot be frustum-culled** (its bounding sphere
  is the map). Hand it to `createInstanceCuller()` in `src/instance-cull.js`
  with a range that matches how big the object is on screen.
- **A map-wide merged mesh has the same problem.** Tile it (see the cloth
  tiles in `src/street-clutter.js`) so three.js can cull by frustum, and hide
  tiles by distance.
- **Anything over a few hundred triangles that appears many times needs a
  near/far split.** `src/vehicle-models.js` builds both; parked rickshaws went
  from 852 to about 60 triangles beyond 55 m.
- **Move things in the vertex shader, not on the CPU.** Birds, flags, laundry,
  rain, breathing dogs: one uniform a frame, no buffer uploads.
- Do not enable `castShadow` or add lights to make something look better. The
  sun's shadow map is off for a reason.

### CPU per frame

- **No allocations in hot paths.** No `new Vector3`, no array spreads, no
  closures created per frame. Module-level scratch objects.
- **Do not upload a buffer that did not change.** Set `needsUpdate` only when
  you wrote to it; skip the draw entirely when a pool is empty.
- **Amortise.** Work that does not need 60 Hz runs at 20-30 Hz or round-robin
  (see traffic recycling, puff emission, `evenFrame` in `src/main.js`).
- **Raycasting is expensive here.** The building meshes have no BVH, so a ray
  walks every triangle of every candidate mesh, and an InstancedMesh is tested
  instance by instance. Thirteen rays a frame cost 2-6 ms on an M4. Raycast on
  events, not per frame, and keep decoration out of the candidate list.
- **Only re-pack when the viewer has moved.** Cullers and LOD packers re-run
  after 12-48 m of travel, not every frame.

### Load time

- First load was cut from about 6 s to 2 s on purpose. Anything not needed for
  the first frame loads after it.
- **Never loop all buildings against all roads** (35k x 1.4k). Build a grid
  first. A lookup that walked all 700 metro-line segments per query was a
  third of one module's build time until it got one.
- Canvas textures are drawn once, at build time, and kept as small as the
  closest view allows.

### Tiers and the governor

Every new visual system must plug into both:

```js
setDetailScale(scale) // 0.5..1 from the perf governor: pull draw DISTANCES in
setQuality(tier)      // 'high' | 'low' | 'minimal': cut counts and shader work
```

Register it in `applyEffectsQuality` / `applyDetailScale` in `src/main.js`.
`low` is where phones and <= 4-core / <= 4 GB machines start. `minimal` is for
a machine that is still over budget at the governor's floor, and should remove
your most expensive pixels outright while keeping the feature recognisable.

## How to measure

`requestAnimationFrame` timing is useless in a background or embedded tab (it
is throttled). Measure synchronously, from the console, with the debug hook
(`docs/DEBUG-HOOK.md`):

```js
const { renderer, scene, camera } = window.__mirpur;
const gl = renderer.getContext(), px = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const gpuMs = (rounds = 5, frames = 8) => {
  const t = [];
  for (let r = 0; r < rounds; r++) {
    sync(); const t0 = performance.now();
    for (let i = 0; i < frames; i++) renderer.render(scene, camera);
    sync(); t.push((performance.now() - t0) / frames);
  }
  return t.sort((a, b) => a - b)[rounds >> 1];
};
```

1. **A/B, alternating.** Toggle your group's `visible`, measure with, without,
   with, without, and take medians. Single readings drift by more than most
   features cost.
2. **Make the GPU the bottleneck first.** A fast laptop is submission-bound at
   its native resolution, so fill cost is invisible. `renderer.setPixelRatio(6)`
   (about 20 MP) before measuring, restore after. A percentage at 20 MP is a
   fair prediction for a fill-bound machine at its own resolution.
3. **CPU:** wrap the system's `update()` in a 200-iteration timing loop.
   Multiply by 5 for a low-end laptop.
4. **Counts:** `renderer.info.render.calls` and `.triangles` after a render.
5. **Load:** every builder returns `stats.ms`. Check it.
6. **Real time:** play it and look at frame-time median and p95, not average
   FPS. Settings > Show stats, or `?debug`.

Useful switches: `?aa=0|1`, `?res=fixed`, `?weather=rain`, `?debug`.
Yardstick views: Pallabi spawn looking down the avenue, and the Mirpur 10
golchokkor in daylight with traffic.

## Definition of done

- [ ] Measured before and after with the method above, numbers in the PR.
- [ ] Draw calls, triangles and build ms reported.
- [ ] Has `setDetailScale` and `setQuality`, wired in `src/main.js`.
- [ ] Nothing allocates per frame; nothing uploads an unchanged buffer.
- [ ] No console errors, including shader warnings, in dry, rain and night.
- [ ] `npm run build` passes.
- [ ] Says plainly what was **not** tested. "Not measured on a real low-end
      device" is a required sentence until someone has one.
- [ ] A short `docs/PERF-PASS-<date>-<topic>.md` for anything non-trivial:
      how measured, table, what was wasted, what is not done.

## For AI agents specifically

- **Measure, do not reason your way to a number.** If you did not run it, do
  not state it. Never write that something "runs at 60 fps on low-end devices"
  from a desktop measurement.
- **Profile before optimizing.** Twice now the real cost was somewhere nobody
  was looking (4x MSAA on a hi-DPI buffer; a per-frame raycast in the intro).
  Find the biggest number first, then cut that.
- **Do not trade a bug for a millisecond.** Cheaper checks must keep the
  behaviour. When the intro's clearance test was cut from 13 rays to 1, the
  failure mode (camera stalls for the rest of the shot) had to be fixed too.
- **Other sessions may be editing and serving this checkout.** Ports 5183 and
  5184 are often taken: open the running server by URL instead of starting
  another. Put new work in new files, keep edits to shared files
  (`src/main.js`, `src/traffic.js`, `src/metro.js`) small and additive, and do
  not switch branches or reset in a shared working tree.
- Follow the project's comment style: say *why*, with the number that
  justified it.

## Known hot spots (as of 2026-09-21)

- Pedestrians: 169k triangles in one mesh, no far LOD.
- 4x MSAA on low-DPI screens, which is where low-end PCs are.
- 39 textures are JPGs that expand to full size in VRAM; only the facade
  atlas is KTX2.
- The monsoon's wet ground is a separate alpha layer; folding it into the
  road materials would remove a whole pass over the ground.
- `buildTrainInterior()` and the first approach to a station interior each
  stall for 13-40 ms.
