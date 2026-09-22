# Street fight: on-foot melee and robbery, 2026-09-22

The on-foot layer had an economy (cha, food, errands) and no way to be a
nuisance in it. This pass adds the smallest thing that changes that: a punch,
a kick, and a robbery, built on the crowd machinery the game already ships
rather than a second physics system.

## What it is

- **`Q` punches** (1.9 m, forward cone, 0.34 s recovery). **Hold `Q`** and the
  same press becomes a **kick** at 0.45 s (2.3 m, 0.9 s recovery).
- **Left-click punches too**, but only with the pointer locked — the click
  that *requests* the lock must never swing (main.js's canvas click is a
  mousedown as well).
- A hit throws the agent into the **existing ragdoll pipeline**
  (`traffic.js#strike`), with the same `MAX_RAGDOLLS` cap a car rampage obeys.
  A punch is fate `'flee'`: they get up and run from the player. A kick is
  fate `'limp'`: they limp away, the pavement panics (`panicNear`), and a few
  blood droplets spawn through `hit-fx.js` — i.e. **Settings > Blood covers
  this with no new toggle**.
- **`R` robs a downed pedestrian** for ৳12–59. Its own key, deliberately not
  `E`: E stays purely "interact" (hail a ride, cha, gates, board a train), and
  main.js's `interactWithWorld()` chain is untouched. `R` was audited against
  the rest of the game — it is drive.js's look-behind (driving only) and the
  full map's recenter (map open only); in both of those modes `canFight()` is
  false and this module's handler never runs, and it never calls
  `preventDefault()`, so neither owner loses the key. The prompt renders
  through the shared HUD keycap renderer, which now matches any single-letter
  prefix rather than only "E: ".
- On a hit the victim shouts (Bangla, flavour-only, like traffic.js's
  run-over lines), witnesses bolt, and **notoriety** goes up by one:
  persisted in `streetlife.state.data.notoriety`, decaying one point every
  2 minutes, toasted at the time. On **touch** there is no R key, so the
  Interact button robs when a body is in reach and the prompt's keycap reads
  E; the Punch button throws the punch.
- **Touch controls** get a **Punch** button; robbery rides the existing
  Interact button. Help modal (`index.html`, both places) and the README
  controls table list `Q` and `R`, per the house rule for a new binding.

## The animation

Two halves, both driven from `src/street-fight.js`:

- **First person**: a fist and a boot built as two merged vertex-coloured box
  chains (the same merge-instead-of-group pattern avatar.js uses), placed from
  the view basis each frame of the swing and **hidden the rest of the time** —
  two draw calls for ~0.26 s (punch) / 0.44 s (kick) and zero otherwise. They
  are world-space rather than parented to the camera because the camera is not
  in the scene graph; the boot swings slower and lower than the jab, and the
  camera takes a small recoil that is re-applied per frame, so it cannot
  accumulate (player.update rewrites the camera from yaw/pitch every frame).
- **Third person**: the same swing is forwarded as `player.swingPose` into
  `avatar.update()` (player.js, 1 line), and avatar.js poses its own right arm
  (punch) or right leg (kick) over the walk cycle using the pivots it already
  has — no new geometry, no new draw call. A swing cut short by a menu, the
  car or the map is ended rather than left hanging.

## The tone boundary (read this before reviewing)

`CONTRIBUTING.md` §Conduct is why this feature is the way it is, not a
disclaimer bolted on:

- Targets are the **anonymous procedural crowd only** — never a named shop,
  station, sign or landmark. The real businesses the project models
  sign-for-sign are not robbery targets.
- **Melee is non-lethal by construction.** `strike()` is only ever passed
  `'flee'` and `'limp'`, never `'dead'`; the worst a fist or boot does is put
  someone on the ground for a few seconds. Cars remain the only thing that
  produces the `'dead'` fate.
- Blood exists only on the hard-kick case and obeys the existing switch.
- Being seen has a cost (witnesses scatter, notoriety sticks), so robbing is
  not a free money printer next to the errand economy — it is just the faster,
  nastier option.

## Cost

Event-driven by design, which is why the two mandatory knobs are wired but
empty (`setDetailScale` / `setQuality` no-ops, registered in `main.js`):

- A punch runs **one pass over the ~750-agent array, on the keypress only**
  (no raycast, no per-frame work, no allocation in the scan), and the robbery
  scan on the keypress does the same.
- The rob prompt rescans at **4 Hz** (`streetlife`'s own slowTimer cadence)
  and returns immediately when nobody is down.
- No new textures and no new dependencies. The swing model is two meshes
  (~48 triangles) that are **visible only while a swing plays** (~0.3 s) —
  two draw calls then, zero otherwise — and the third-person swing reuses the
  avatar's existing limb instances, so it adds no geometry at all. The sounds
  (thud/kick, whiff, coin) are WebAudio one-shots on the app's single shared
  context (`src/audio.js`), created on the input that caused them.
- `traffic.js` gains `strike`, `panic`, `say` exports and one behaviour
  branch: a punched agent flees the **player** (there is no car to run from);
  the car-hit path is untouched.

## Verified

- **`node tools/smoke-street-fight.mjs` — all 36 checks pass.** It stubs
  window/document/HTMLElement/a scene and camera the way `smoke-sangsad.mjs`
  stubs a 2D context, then drives the real module through its real input path:
  the cone hit and the miss behind it, the keydown punch, the 0.45 s hold
  upgrading to the kick, the blocked modes refusing, **R (not E) robbing once
  and only in reach**, the prompt keycap switching between R and E for touch,
  the panic/shout/notoriety side effects, the recycled agent's robbed flag
  resetting, and the swing starting, being placed in view space, ending,
  hiding, and handing over to the avatar pose in third person.
- **Key audit for `R`** (the whole point of moving robbery off `E`):
  `grep -rn "KeyR" src/ index.html` returns exactly two owners — drive.js's
  look-behind (it reads `keys.has('KeyR')`, driving only) and fullmap-view.js's
  recenter (`case 'KeyR'`, and its handler returns unless the map canvas has
  class `expanded`). Both are modes where `canFight()` is false, and this
  module never calls `preventDefault()`, so neither can collide with robbery
  or lose the key. `E` keeps its single meaning: main.js's
  `interactWithWorld()` was left exactly as it was.
- `npm run build` passes (the repo's hard gate).
- `node --check` on every edited/created module.
- Logic read-through against the real fields: `agents[]._wx/_wz` (rail
  position, set every `peds.update`), `rx/rz/rlanded` (ragdoll), `fate`
  lifecycle through `beginFree/stepFree/endFree`, `MAX_RAGDOLLS` eviction,
  `fx.burst`'s `bloodOn` gate, `player.feetY`/`flying`/`inRide` gates, and
  the camera being rewritten by player.update() every frame (so the recoil
  cannot accumulate).

## NOT verified

- **Not played in a browser by the author of this pass.** No device was
  available: input feel (kick timing, cone width), shout-line sync with the
  ragdoll, the touch button layout on a real phone, and whether 4 Hz is the
  right prompt cadence are all read-from-code claims, not felt ones.
- **The animation has not been seen, only exercised headlessly** — the smoke
  test proves the swing starts, is positioned with finite coordinates, ends,
  hides, and sets `player.swingPose`, but it cannot judge whether the fist or
  boot reads well on screen: the view-space offsets in
  `PUNCH_READY/PUNCH_LAND/KICK_READY/KICK_LAND` may want tuning, and the
  third-person avatar punches along its own facing (where it last walked),
  not the camera's — worth a look in `P` (third person).
- Not measured on a low-end device (the project's standing requirement): the
  per-press scan is ~750 iterations, but no frame-time number was taken with
  twelve bodies down in heavy traffic.
- `notoriety` is not yet shown in the journal; it is only a toast and state.
- No police/wanted escalation: the world has no such system, and inventing one
  was out of scope for this pass.
