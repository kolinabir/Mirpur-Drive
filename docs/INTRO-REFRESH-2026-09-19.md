# Metro-first intro — 19 September 2026

- Five-shot, 15-second opening: approaching metro, passenger window view, neighbourhood title reveal, street detail, walking handoff.
- Passenger camera stays fixed inside coach 3 of the actual staged train. Uses the existing rideable interior; attaches only for this shot and detaches on cut, skip, or completion.
- Cuts happen behind black. Camera movement is checked against nearby rendered mesh geometry, including two-sided walls/roofs and instanced objects. A blocked move holds the previous position; unsafe cut destinations fall back to the gameplay pose. Unknown district spawn points use a stationary composition.
- Metro updates before the camera; staged poses are applied immediately when a shot starts. This prevents following the previous frame's train position.
- Minimal bilingual title and location captions; removed progress bar. Filtered rail sound fades into existing world ambience, whose listener follows the cinematic camera.

## Verification

- Chrome: inspected all five compositions using a temporary local review panel (removed after inspection).
- Full 15-second playback completed with `blockedMoves: 0`. Passenger window view shows buildings moving past; no camera clipping observed in the reviewed views.
- Production build and changed-JavaScript syntax checks pass. Existing Three.js bundle-size warning remains.
- Lint and typecheck attempted; neither script exists in this project.
- No automated tests added. No commit, push, or deployment.

## Manual checks

1. Open the local app and choose PLAY INTRO. Watch the approaching train, inside-window ride, title reveal, street shot, and walking handoff.
2. During the second shot, confirm the seats and window frames stay fixed while the city moves outside.
3. Reload and press Skip intro during the train ride. Repeat with Space and Escape; each should fade into the same walking position.
4. Choose FREE ROAM and confirm immediate entry. Walk/look around after both full playback and skip.
5. With reduced motion enabled, replay and check static compositions and the final handoff. Physical-phone and reduced-motion browser acceptance remain manual.
