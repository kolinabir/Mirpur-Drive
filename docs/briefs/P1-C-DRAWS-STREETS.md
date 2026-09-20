# P1-C (streets part): draw-call audit and merge in streets.js

Owner file: `src/streets.js` ONLY. Docs: `docs/DRAWCALLS.md` (create; other
P1-C executors will append their own sections later).
Read: docs/briefs/P0-COMMON.md, docs/briefs/P1-PERF-BOUNDARY.md row P1-C,
docs/ROAD-PASS.md.

Draw calls are ~705 at the start view (were 246 at the start of the day).
1. AUDIT FIRST. With the debug hook, walk `window.__mirpur.scene` and
   count, per top-level group name (`ground`, roads, `street-furniture`,
   `station:*`, `city` tiles, traffic, interior, car...), how many Mesh /
   InstancedMesh / LineSegments objects are visible in the frustum at the
   start view. Simplest: temporarily set `scene.onBeforeRender` hooks? No:
   use `renderer.info.render.calls` while toggling each group's `visible`
   flag off and on from javascript_tool, and record the delta per group.
   Write the table into docs/DRAWCALLS.md before editing anything.
2. In streets.js, merge whatever you own that costs more than ~10 calls:
   one BufferGeometry per material for roads by rank, footpaths, kerbs,
   medians; pole/lamp instancing into a single InstancedMesh per part
   type; cables into one LineSegments. Keep names on the merged objects.
   Do not change how anything looks (compare p0-poles-under.jpg before /
   p1-draws-under.jpg after visually).
3. Report calls before/after for the streets groups and for the whole
   frame at the start view and at the aerial view.
Close your browser tab when done.
