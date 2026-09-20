# Pass 1: playable boundary, LOD, draw calls, debug flag (QUEUED)

Starts when city.js (E4b), main.js/player.js (E3b), streets.js (E1b) and
metro.js (E2b) are all free. Split into fenced executors:

| Executor | Files | Task |
|---|---|---|
| P1-A boundary | src/player.js, src/drive.js | Soft boundary at 400 m from the metro centreline: HUD warning "Turn back" past 380 m, gentle push-back force past 400 m, hard stop at 430 m, for walking and driving. No invisible wall mid-road; fade the push in. |
| P1-B LOD | src/city.js | Buildings tagged `far` (400-1000 m): no rooftop props, no emissive windows, castShadow=false. Tiles beyond 700 m from the player: `visible=false` (cheap per-frame tile check, already tiled at 200 m). |
| P1-C draws | src/metro.js, src/interior.js, src/streets.js (sequential, one at a time) | Merge per-material buckets so total draw calls < 300 at the start view. Count per group with renderer.info before/after. |
| P1-D debug flag | src/main.js, index.html | Fly mode, keys 3/4 and the aerial preset only when `?debug` is in the URL or `localStorage.mirpurDebug=1`. Prod build hides them. Executors keep using `?debug`. |
