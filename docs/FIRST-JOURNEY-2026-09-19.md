# First journey and mobile controls — 19 September 2026

## Changed

- Simplified start card, optional controls/details, direct entry, and touch-control selector.
- Cinematic uses a clear elevated train shot, stages the train when that shot begins, fades through black on skip, and ends facing the gameplay direction. HUD/input remain blocked through completion. Reduced-motion users and inter-district arrivals enter directly; spawn height is preserved.
- Dismissible walking → enter car → first 30 m guide, with desktop/touch instructions.
- Touch joystick, drag-look, run/jump/interact/view, driving accelerator/brake/steering/handbrake. Portrait/landscape HUD spacing and manual touch-mode fallback for hybrid devices.
- Keyboard/touch inputs clear on blur and menus. Text entry and repeated keys do not toggle vehicles or player modes.
- Fixed shop sunshades/signs using raw building footprints while the buildings use corridor-clipped footprints. A temporary pointer raycast identified the floating road strip as `shop-signs/sunshades`; signs now use the existing cached `getClippedFootprint` result. Diagnostic code removed.
- Night material discovery no longer adds emissive properties to unlit materials, fixing the startup missing-uniform render exception.

## Verification

- Production build passes; existing Three.js chunk warning remains.
- Changed JavaScript syntax checks and `git diff --check` pass.
- `npm run lint` and `npm run typecheck` attempted; neither script exists in this project.
- Browser: full cinematic, visible train, street handoff, skip/direct entry, guide switching on car entry, driving camera change and car exit.
- Final browser street view confirms floating strip removed. No new render exceptions after material fix; prior errors in the same tab were timestamped before the fix.
- Mobile agent checked Chrome at 390×844 and 844×390 with the user-visible touch option. Verified accelerator gesture reaching 4 km/h, View changing to CHASE FAR, enter/exit, menus hiding touch controls, `vwasd` search text not triggering driving shortcuts, and camera drag changing view.
- Physical phone, simultaneous multitouch, sustained driving and first-30-m guide completion remain manual checks. Joystick gesture was exercised, but a reliable movement delta was not measured.
- No tests added, commit, push or deployment performed.

## Manual acceptance

1. Run `npm run dev`, open the local URL, and choose Begin your journey. Watch all shots and the walking handoff.
2. Reload and skip mid-intro; confirm a short fade and arrival at the same street. Try direct entry separately.
3. Walk a few metres, press V, drive 30 m with WASD, change camera with C, and exit with V. Check the guide advances and disappears after completion, or dismiss it manually.
4. On a phone, use the left pad and drag-look simultaneously. Enter Drive, hold Accelerate while steering, brake, change view and exit. Repeat in portrait and landscape.
5. Open Teleport, type `vwasd`, close it and confirm movement does not stick. Repeat after changing apps/losing focus.
6. Cycle time with T and confirm night rendering remains intact.

## Follow-up: automatic touch and entry redesign

- Touch defaults now detect coarse pointers, touch-capable compact/no-hover devices, and actual touch gestures. Controls/options is an optional manual override, not an onboarding requirement.
- Replaced the centered card with a full-screen metro view, clear title hierarchy and one primary Start exploring action. Direct entry and manual controls moved under Controls & options.
- Reduced motion no longer silently skips the introduction; it uses still camera compositions and lands directly on the final gameplay pose. Normal arrivals from other districts continue to bypass the introductory tour.
- Clicking the scenery no longer accidentally skips the intro. Explicit Skip intro, Space and Escape remain supported.
- Refreshed browser verification shows the train shot, full introduction and unobstructed road. The screenshot's floating strip does not appear after reload; the shared clipped-footprint fix remains applied.
- Build, changed-JavaScript syntax and whitespace checks pass. Lint/typecheck still unavailable (missing scripts). Physical-phone detection and multitouch acceptance remain outstanding.
