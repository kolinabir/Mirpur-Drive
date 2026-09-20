# P0-E3b: resume the walkable interiors (E3 was stopped mid-verification)

Owner files: `src/player.js`, `src/main.js`, `src/interior.js`,
`src/walkable.js`. Docs: `docs/INTERIOR-PASS.md` (create; E3 never wrote
it), `docs/DEBUG-HOOK.md` (update). Screenshots: screenshots/p0-int-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/briefs/P0-E3-INTERIOR.md (the original
brief; everything there still applies), docs/DEBUG-HOOK.md,
reference/metro/OWNER-PHOTOS-2026-09-07.md sections P6-P12 (owner photos of
the real concourse and platform; they win over SPEC-INTERIOR).

## State found on disk (advisor, 15:05)
- walkable.js (178 lines), interior.js (366 lines), gravity/feetY in
  player.js, createInteriorSystem wired in main.js, DEBUG-HOOK.md written.
  All files parse. `window.__mirpur` has player/scene/renderer/camera/
  metro/collision/capture but NOT `walkable` or `interior`: add both.
- metro.stations[0] = Mirpur 10 at (148.7, 593.9) heading 0.246 with 4
  entrances (E2 added `entrances`); read its shape and use it.
- No INTERIOR-PASS.md, no p0-int screenshots: verification never happened.
- Console error every frame: `renderer.render threw (frame loop
  continuing): TypeError: Cannot read properties of undefined (reading
  'value')` caught at main.js:380. First job: find the source (grep for
  `.value` on uniforms in sky.js, night.js, facades.js, metro.js; a
  material whose shader uniform was removed is the usual cause). If it is
  in a file you own, fix it; if not, write the exact stack and culprit
  line into docs/INTERIOR-PASS.md under "for E2/advisor" and disable the
  offending update call defensively from main.js (guard, do not delete).
- Ignore transient `isInCorridor is not defined` errors: another agent is
  editing city.js live.

## Then finish the original brief
Run the acceptance walk from P0-E3-INTERIOR.md using the hook (street ->
entrance -> escalator -> concourse -> ticket -> gate -> platform -> 100 m
-> lift -> street), log feetY per stage, save the 8 screenshots with
distinct md5s (use player.update(0) + capture()), confirm the track is
unreachable, confirm street walking far from stations is unchanged. Apply
the owner-photo finishes where cheap. Report what is not done.
