/**
 * smoke-sangsad.mjs — headless check on src/sangsad.js.
 *
 * The Parliament is built from a 177-point OSM ring with 14 interior voids
 * and merged out of both indexed and non-indexed geometry, which is exactly
 * the shape of thing that silently produces NaN vertices or a null merge.
 * This runs the real builder against the real scene file with a stubbed
 * canvas (the concrete texture is the only DOM dependency) and fails loudly
 * on NaN, so a regression shows up here and not as an invisible building.
 *
 *   node tools/smoke-sangsad.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctxStub = new Proxy({}, { get: () => () => {} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { buildSangsad } = await import(new URL('../src/sangsad.js', import.meta.url));
const scene = JSON.parse(readFileSync(resolve(ROOT, 'public/scene-bijoy.json'), 'utf8'));
const out = buildSangsad(scene);
if (!out) { console.error('FAIL: returned null'); process.exit(1); }
console.log('stats', out.stats, 'colliders', out.colliders.length);
let bad = 0, tris = 0;
out.group.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const pos = g.attributes.position.array;
  let nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;
  const count = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  tris += count; if (nan) bad++;
  console.log(` ${o.name.padEnd(26)} tris=${String(Math.round(count)).padStart(6)} nan=${nan}`
    + ` x[${bb.min.x.toFixed(1)},${bb.max.x.toFixed(1)}]`
    + ` y[${bb.min.y.toFixed(1)},${bb.max.y.toFixed(1)}]`
    + ` z[${bb.min.z.toFixed(1)},${bb.max.z.toFixed(1)}]`);
});
console.log('total triangles', Math.round(tris), 'meshes with NaN:', bad);
process.exit(bad ? 1 : 0);
