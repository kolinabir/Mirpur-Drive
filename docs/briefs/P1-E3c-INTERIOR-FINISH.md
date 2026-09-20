# P1-E3c: finish and texture the station interiors

Owner files: `src/interior.js`, `src/walkable.js` ONLY. Docs: append to
`docs/INTERIOR-PASS.md`. Screenshots: screenshots/p1-int-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/INTERIOR-PASS.md (E3b's state and
feetY log), docs/WALKABLE-INTERIOR-DESIGN.md, docs/METRO-REVIEW.md (the
`station.entrances[]` shape E2 added), docs/TEXTURES-METRO.md (slugs,
tints, repeats), reference/metro/OWNER-PHOTOS-2026-09-07.md P6-P12 and
third batch (entrance stairs).

1. Use the real `metro.stations[i].entrances[]` (world x/z, letter, side)
   for the entrance cores instead of the synthetic fallback; keep the
   fallback only if the array is absent. Re-run the feetY walk to the
   concourse for entrance D at Mirpur 10 and one at Mirpur 11.
2. Complete the walk: ticket machine (E), gate line (E), paid-side stair
   or escalator to DECK_Y, platform slab full length with the PSD-line
   barrier, lift portal down, exit at the opposite entrance. Log feetY at
   each stage; 8 screenshots at LOW resolution (capture at quality 0.5,
   or set renderer size smaller via the hook before capture) so the
   base64 is short enough to save reliably.
3. Textures (loadTextureSet from src/textures.js, import only): concourse
   floor tiles-light-stone (0.8 m, tint #EDEAE4) with the yellow tactile
   strip as a separate thin slab; walls panel-cream (tint #EDEAE4);
   ceiling: aluminium-brushed with a procedural strip pattern is fine;
   platform floor granite-dark-polished (0.6 m, tint #4F5250,
   roughness 0.35); PSD frames, handrails, gates, lift doors steel-brushed
   (tint #C9CDCE, metalness 0.9, roughness 0.35); stair treads granite.
   Geometry from BoxGeometry has UVs; scale UVs by world size so the
   repeats are metric (set uv * (size / repeatMetres)).
4. Draw calls: bucket by material per station as metro.js does; interior
   must add < 40 draws per station.
Run when possible with few other src/ executors live; if the page
reloads under you, wait 30 s and re-acquire the hook rather than giving
up. Close your tab.
