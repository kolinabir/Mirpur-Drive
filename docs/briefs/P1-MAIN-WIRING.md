# P1-MAIN: wire streaming + LOD, playable boundary, debug flag, scene switch

Owner files: `src/main.js`, `index.html`, `src/player.js`, `src/drive.js`.
Docs: `docs/MAIN-WIRING.md` (create). Screenshots: screenshots/p1-main-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/STREAMING.md, docs/LOD-PASS.md,
docs/DECISION-PLAYABLE-AREA.md, docs/briefs/P1-PERF-BOUNDARY.md (rows
P1-A and P1-D), docs/NORTH-DATA.md, docs/DEBUG-HOOK.md, docs/DRIVE.md.

1. Streaming/LOD wiring (docs/STREAMING.md): pass
   `{ start: mirpur10, initialRadius: 500 }` to buildBuildings and call
   `updateBuildingLOD(player.position.x, player.position.z)` after
   `player.update(dt)` each frame (also while driving: drive.js no-ops
   player.update, so call it from the frame loop unconditionally using
   player.position, which drive.js keeps in sync). Confirm the console
   warn from city.js is gone and getStreamingStats().built grows as you
   move.
2. Scene switch: `?scene=north` (or localStorage.mirpurScene = 'north')
   loads `/scene-north.json` instead of `/scene.json`. Default stays the
   current scene for now. Start position stays Mirpur 10. Check the
   loading text handles 55k buildings (it is only bucketing now).
   Measure time-to-"Enter the street" for both scenes and record it.
3. Playable boundary (P1-A): distance from the nearest playable corridor
   = use `scene.meta.playable` and the metro/arterial polylines from the
   scene (for the current scene: the metro only; for north: metro plus
   the roads whose ids are in meta.playable.extraCorridorWayIds). At
   > 380 m show a HUD line "Turn back: leaving Mirpur"; at > 400 m apply
   a gentle push back toward the corridor in player.js walking and in
   drive.js driving (reduce speed and steer back); hard clamp at 430 m.
   No invisible wall inside 400 m.
4. Debug flag (P1-D): fly (F), keys 3 and 4, and the aerial preset only
   when `?debug` is in the URL or localStorage.mirpurDebug === '1'.
   Executors keep using `?debug`. Hide the corresponding lines in the
   start card when disabled.
5. Do not touch interior.js/walkable.js/metro.js/city.js/streets.js.
Verify with screenshots: p1-main-start.jpg (current scene, unchanged),
p1-main-north-start.jpg (?scene=north at Mirpur 10), p1-main-north-
uttara.jpg (teleport to Uttara South station via the hook, buildings
streamed in), p1-main-boundary.jpg (HUD warning showing). Record timings
and getStreamingStats() in docs/MAIN-WIRING.md. Close your tab.
