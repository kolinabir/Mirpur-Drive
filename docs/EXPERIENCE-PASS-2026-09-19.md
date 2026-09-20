# Experience pass — 19 September 2026

User requested sequential work by one agent, no subagents. Preserve the existing dirty working tree. No tests, commits, pushes or deployment requested.

## Work order

1. Dhaka metro sound: inspect rolling stock/ride references; speed-linked traction, rolling, braking and cabin sound.
2. Visible wind-driven clouds with bounded rendering cost.
3. Browser map/street references, then correct Pallabi, Uttara South (water/lakes), Mirpur DOHS one area at a time. Distinguish observed features from procedural approximation.
4. One Start button; intro by default; any click/tap skips cleanly to gameplay.
5. Inspect every implemented station; fix lift composition/access and stair/building clashes.
6. Fix road/building intersections with shared geometry/collision logic; inspect other experience bugs.
7. Measure actual performance, fix bottlenecks, build/syntax/available lint/type checks, browser acceptance and manual handoff.

## Baseline

- Prior intro work: all five frames inspected; complete 15-second playback reported zero blocked camera moves. Final normal-button verification was interrupted by the next user request.
- Existing workspace has extensive concurrent/prior changes. Build passed; lint/typecheck scripts are absent.
- Metro voices currently use two simple tones plus noise. Cinematic duplicates a separate noise bed. Cinematic staging does not update train speed after changing its pose.
- Cloud field already translates slowly, but camera-follow translation removes parallax, modulo resets the whole layer, 110 large transparent planes add overdraw, and intro explicitly hides clouds.

## References

- Kawasaki rolling-stock specification: https://global.kawasaki.com/en/corp/newsroom/news/detail/?f=20210304_8861
- Mitsubishi rolling-stock contract/specification: https://www.mitsubishicorp.com/jp/en/news/release/2017/0000032988.html
- DMTCL rolling-stock package: https://dmtcl.gov.bd/pages/static-pages/6922de7f933eb65569e1b130
- Ride footage discovered via agent-reach/yt-dlp: https://www.youtube.com/watch?v=3TI-7r-Ck4c

## Completed / measured

- Metro audio now uses a pooled, positional VVVF-style traction layer with stepped carrier bands, rolling and air noise, braking noise, cabin ventilation and a three-note door-close chime. It shares the existing audio context and keeps a two-train voice cap.
- Clouds are instanced in two bounded layers (32 cumulus / 12 cirrus). Wind motion runs in the vertex shader; the frame loop updates only time/origin uniforms, so the cloud field follows the player without rebuilding meshes.
- Browser map/street references were checked for Pallabi, Uttara South and Mirpur DOHS. Pallabi received the denser shopfront/apartment treatment; Uttara South and Mirpur DOHS received region-specific facade detail coverage. Existing OSM water polygons are now blue-green with a single batched shoreline pass for the mapped ponds/reservoirs.
- The default primary action starts the five-shot, 15-second intro. Clicking the scene outside controls enters free roam immediately. The intro's second shot is an interior passenger-window view looking out from the moving metro. The clearance raycast held or backed out unsafe camera motion; the final playback completed with zero blocked moves.
- All four implemented stations were checked from their exterior lift positions. Each showed the contextual lift prompt and opened the floor selector: Mirpur 10, Pallabi, Uttara South and Mirpur 11. The lift shaft/landing doors are now visibly glazed and the published entrance stair direction is shared by the shell and interior walkable ramp.
- Road/building cleanup now uses the OSM road centreline index during building clipping. The browser log reports 24 building footprints removed where a road centreline ran through them, while 47 sliver/straddling footprints were dropped and the remainder clipped at the carriageway edge.
- Desktop browser spot readings stayed at 60 FPS after settling: Pallabi 60 fps / 223 draws / 1,034k tris; Mirpur DOHS 60 fps / 306 draws / 987k tris; its pond 60 fps / 206 draws / 948k tris; Uttara South 60 fps / 370 draws / 981k tris; Uttara reservoir 60 fps / 340 draws / 953k tris. These are repeatable spot checks, not a sustained-device guarantee.
- `npm run build`, modified-module `node --check`, and `git diff --check` pass. `npm run lint` and `npm run typecheck` were attempted; neither script exists in this repository. The existing Vite chunk-size warning remains.

## Browser acceptance

- Default start screen: primary **START JOURNEY** entered the cinematic; a click on the scene image entered free roam immediately.
- Intro handoff: after the 15-second sequence the HUD returned to free roam at Pallabi at 60 fps.
- Lift menu: all four station checkpoints showed `E: use lift · choose floor` and opened **SELECT FLOOR**.
- Runtime logs contained no error or warning entries during the final preview pass.
