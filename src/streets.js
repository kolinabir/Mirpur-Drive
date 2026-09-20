/**
 * streets.js
 *
 * Ground plane, road ribbons, footpaths, green space, and the street furniture
 * that makes the corridor read as Dhaka rather than as generic extruded OSM:
 * cobra-head streetlights, concrete power poles, and the overhead cable tangle
 * strung between them.
 */

import * as THREE from 'three';
import earcut from 'earcut';
import { centreAlignment } from './metro.js';
import { loadTextureSet } from './textures.js';
import { UTTARA_Z_THRESHOLD } from './facades.js';

/** Colours sampled to match the corridor's washed-out, dusty palette. */
export const COLORS = {
  ground: 0x9a9184, // bare compacted earth and dust between buildings
  asphaltMain: 0x3e3d3c,
  asphaltMinor: 0x4a4744,
  asphaltService: 0x565049,
  footpath: 0x8a8378,
  median: 0x7d8a6d,
  park: 0x6e7f56,
  wood: 0x556b41,
  pitch: 0x7a8a5a,
  water: 0x53664f, // Dhaka canals read green-brown, not blue
  bare: 0x8d8579,
  parking: 0x6a6660,
  cemetery: 0x77805f,
  institutional: 0x8f8a7a,
  concrete: 0x8c8b85, // the metro viaduct grey
};

/** Vertical stacking to keep coplanar surfaces from z-fighting. */
const Y = {
  ground: 0,
  area: 0.04,
  footpath: 0.06,
  service: 0.08,
  minor: 0.1,
  major: 0.12,
  marking: 0.145,
  median: 0.16,
};

/**
 * The corridor road (built from the metro centreline in
 * buildMetroCorridorRoad) covers the SAME ground as the OSM way for Begum
 * Rokeya Ave, which the generic road pass also draws — the corridor
 * carriageway sat at exactly Y.major and roads-major at exactly Y.major, and
 * the corridor footpath at exactly Y.footpath alongside the generic
 * footpaths. Two coplanar surfaces at identical depth is textbook
 * z-fighting, and it showed up as the smeared brown/grey patchwork the owner
 * reported on 2026-09-07 ("glitch in road texture!"), worst at grazing
 * angles down the street.
 *
 * Lifting the corridor ribbons by a few millimetres puts the good
 * photographic asphalt cleanly on top and stops the fight. It is far below
 * the 0.15 m kerb, so nothing else in the Y table is disturbed, and the
 * duplicate surface underneath is then completely hidden by the one above.
 */
const CORRIDOR_LIFT = 0.006;

/**
 * Turn a polyline into a flat ribbon of the given width.
 * Joints use the averaged direction of the adjacent segments, which is enough
 * for road angles at this scale and avoids the cost of a real miter solve.
 */
function ribbon(pts, width, y, pos, nor, uvs, idx, uvScale = 0.12) {
  const n = pts.length;
  if (n < 2) return;

  const half = width / 2;
  const left = [];
  const right = [];
  let dist = 0;
  const dists = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) {
      dx = 1;
      dz = 0;
    } else {
      dx /= l;
      dz /= l;
    }
    // Perpendicular in XZ.
    const px = -dz;
    const pz = dx;
    left.push([pts[i][0] + px * half, pts[i][1] + pz * half]);
    right.push([pts[i][0] - px * half, pts[i][1] - pz * half]);

    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    dists.push(dist);
  }

  for (let i = 0; i < n - 1; i++) {
    const base = pos.length / 3;
    pos.push(
      left[i][0], y, left[i][1],
      right[i][0], y, right[i][1],
      right[i + 1][0], y, right[i + 1][1],
      left[i + 1][0], y, left[i + 1][1]
    );
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    const v0 = dists[i] * uvScale;
    const v1 = dists[i + 1] * uvScale;
    uvs.push(0, v0, 1, v0, 1, v1, 0, v1);
    // Reversed so the ribbon faces up rather than down.
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

/** Triangulate a closed ring into a flat horizontal polygon. */
function fillPolygon(flatXZ, y, pos, nor, uvs, idx) {
  const tris = earcut(flatXZ, null, 2);
  if (!tris || tris.length < 3) return;
  const base = pos.length / 3;
  for (let i = 0; i < flatXZ.length; i += 2) {
    pos.push(flatXZ[i], y, flatXZ[i + 1]);
    nor.push(0, 1, 0);
    uvs.push(flatXZ[i] / 12, flatXZ[i + 1] / 12);
  }
  for (let i = 0; i < tris.length; i += 3) {
    idx.push(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
  }
}

/** Distance from (x,z) to the nearest point on a polyline. */
function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) continue;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx;
    const pz = a[1] + t * dz;
    const d = Math.hypot(px - x, pz - z);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Split a polyline into sub-polylines wherever it comes within `minDist` of
 * the metro centreline, so the OSM primary-road ribbon does not overlap the
 * purpose-built carriageway generated from the metro alignment.
 */
function splitAwayFromCentre(pts, centre, minDist) {
  const out = [];
  let cur = [];
  for (const p of pts) {
    if (distToPolyline(centre, p[0], p[1]) > minDist) {
      cur.push(p);
    } else if (cur.length > 1) {
      out.push(cur);
      cur = [];
    } else {
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Offset a polyline perpendicular to its own running direction. */
function offsetPolyline(pts, dist) {
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    return [p[0] - dz * dist, p[1] + dx * dist];
  });
}

/**
 * A single batched layer of road wear. These marks are deliberately flat and
 * sparse: they give the asphalt patched seams, utility drains, and curb-side
 * grime seen in Dhaka without turning each mark into a scene object.
 */
function buildRoadTextureDetails(roads, roadSegments) {
  const patchPos = []; const patchNor = []; const patchUvs = []; const patchIdx = [];
  const drainPos = []; const drainNor = []; const drainUvs = []; const drainIdx = [];
  let patchCount = 0;
  let drainCount = 0;
  for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
    const road = roads[roadIndex];
    if (road.rank < 2) continue;
    const roadY = road.rank >= 4 ? Y.major : road.rank >= 3 ? Y.minor : Y.service;
    for (const pts of roadSegments(road)) {
      for (let i = 1; i < pts.length && (patchCount < 720 || drainCount < 420); i++) {
        const a = pts[i - 1]; const b = pts[i];
        const dx = b[0] - a[0]; const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 6) continue;
        const ux = dx / len; const uz = dz / len;
        const px = -uz; const pz = ux;
        const seed = (roadIndex * 92821 + i * 68917) >>> 0;
        const chance = ((seed ^ (seed >>> 13)) >>> 0) / 0xffffffff;
        const span = Math.min(len, 28);
        const along = 4 + chance * Math.max(2, span - 8);
        const cx = a[0] + ux * along;
        const cz = a[1] + uz * along;
        if (patchCount < 720 && chance > 0.24) {
          const halfLength = 0.55 + chance * 0.8;
          ribbon([
            [cx - ux * halfLength, cz - uz * halfLength],
            [cx + ux * halfLength, cz + uz * halfLength],
          ], Math.min(0.72, Math.max(0.28, road.w * 0.11)), roadY + 0.004, patchPos, patchNor, patchUvs, patchIdx, 1);
          patchCount++;
        }
        if (road.rank >= 3 && drainCount < 420 && chance < 0.52) {
          const edge = road.w / 2 + 0.48;
          const ex = cx + px * edge;
          const ez = cz + pz * edge;
          ribbon([
            [ex - ux * 0.42, ez - uz * 0.42],
            [ex + ux * 0.42, ez + uz * 0.42],
          ], 0.16, roadY + 0.006, drainPos, drainNor, drainUvs, drainIdx, 1);
          drainCount++;
        }
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'road-texture-details';
  const patch = meshFrom(
    patchPos, patchNor, patchUvs, patchIdx,
    new THREE.MeshLambertMaterial({ color: 0x282724, transparent: true, opacity: 0.34, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    'road-patched-seams'
  );
  if (patch) group.add(patch);
  const drains = meshFrom(
    drainPos, drainNor, drainUvs, drainIdx,
    new THREE.MeshLambertMaterial({ color: 0x252523, transparent: true, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    'road-drains'
  );
  if (drains) group.add(drains);
  return group;
}

/** Add a few batched wet reflections, reeds, and edge debris to mapped water. */
function buildWaterTextureDetails(areas) {
  const group = new THREE.Group();
  group.name = 'water-texture-details';
  const reflectionPos = []; const reflectionNor = []; const reflectionUvs = []; const reflectionIdx = [];
  const reeds = []; const debris = [];
  const dummy = new THREE.Object3D();
  for (let areaIndex = 0; areaIndex < areas.length; areaIndex++) {
    const area = areas[areaIndex];
    if (!area.p || area.p.length < 6) continue;
    const n = area.p.length / 2;
    let cx = 0; let cz = 0;
    for (let i = 0; i < area.p.length; i += 2) { cx += area.p[i]; cz += area.p[i + 1]; }
    cx /= n; cz /= n;
    const edgeIndex = (areaIndex * 5) % n;
    const nextIndex = (edgeIndex + 1) % n;
    const ax = area.p[edgeIndex * 2]; const az = area.p[edgeIndex * 2 + 1];
    const bx = area.p[nextIndex * 2]; const bz = area.p[nextIndex * 2 + 1];
    const dx = bx - ax; const dz = bz - az; const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len; const uz = dz / len;
    const px = -uz; const pz = ux;
    const edgeT = 0.35 + ((areaIndex * 17) % 35) / 100;
    const ex = ax + dx * edgeT; const ez = az + dz * edgeT;
    const rx = ex * 0.62 + cx * 0.38; const rz = ez * 0.62 + cz * 0.38;
    const stripe = Math.min(5.2, Math.max(1.4, len * 0.18));
    ribbon([
      [rx - ux * stripe, rz - uz * stripe],
      [rx + ux * stripe, rz + uz * stripe],
    ], 0.16, Y.area + 0.075, reflectionPos, reflectionNor, reflectionUvs, reflectionIdx, 0.12);
    reeds.push({ x: ex - px * 0.45, z: ez - pz * 0.45, scale: 0.7 + (areaIndex % 4) * 0.12, yaw: areaIndex * 0.61 });
    if (areaIndex % 3 === 0) debris.push({ x: ex + px * 0.16, z: ez + pz * 0.16, yaw: areaIndex * 0.77 });
  }
  const reflections = meshFrom(
    reflectionPos, reflectionNor, reflectionUvs, reflectionIdx,
    new THREE.MeshBasicMaterial({ color: 0xa8d9cf, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    'water-reflection-glints'
  );
  if (reflections) { reflections.renderOrder = 3; group.add(reflections); }
  if (reeds.length) {
    const reedGeometry = new THREE.ConeGeometry(0.055, 0.8, 4);
    reedGeometry.translate(0, 0.4, 0);
    const reedMesh = new THREE.InstancedMesh(reedGeometry, new THREE.MeshLambertMaterial({ color: 0x47653b }), reeds.length);
    reeds.forEach((reed, index) => {
      dummy.position.set(reed.x, Y.area, reed.z); dummy.rotation.set(0, reed.yaw, 0); dummy.scale.setScalar(reed.scale); dummy.updateMatrix(); reedMesh.setMatrixAt(index, dummy.matrix);
    });
    reedMesh.instanceMatrix.needsUpdate = true;
    reedMesh.name = 'water-reeds';
    group.add(reedMesh);
  }
  if (debris.length) {
    const debrisGeometry = new THREE.BoxGeometry(0.16, 0.045, 0.1);
    debrisGeometry.translate(0, 0.03, 0);
    const debrisMesh = new THREE.InstancedMesh(debrisGeometry, new THREE.MeshLambertMaterial({ color: 0x3e3328 }), debris.length);
    debris.forEach((item, index) => {
      dummy.position.set(item.x, Y.area, item.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); debrisMesh.setMatrixAt(index, dummy.matrix);
    });
    debrisMesh.instanceMatrix.needsUpdate = true;
    debrisMesh.name = 'water-edge-debris';
    group.add(debrisMesh);
  }
  return group;
}

const CORRIDOR = {
  carriageway: 10.5,
  median: 3.0,
  footpath: 3.0,
};

/**
 * The main road under the viaduct, generated FROM the metro centreline (not
 * the OSM road way) so the piers stand exactly in the median: two 10.5 m
 * carriageways either side of a 3.0 m planted median, then 3 m footpaths
 * with kerbs.
 */
function buildMetroCorridorRoad(centre, asphaltMat, footMat) {
  const group = new THREE.Group();
  group.name = 'metro-corridor-road';
  const { carriageway, median, footpath } = CORRIDOR;
  const medianHalf = median / 2;
  const carriageInner = medianHalf;
  const carriageOuter = medianHalf + carriageway;
  const footInner = carriageOuter;
  const footOuter = carriageOuter + footpath;

  // Carriageways (asphalt), one each side of the median.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const side of [-1, 1]) {
      const centreOffset = side * (carriageInner + carriageway / 2);
      ribbon(offsetPolyline(centre, centreOffset), carriageway, Y.major + CORRIDOR_LIFT, pos, nor, uvs, idx, 0.09);
    }
    const m = meshFrom(pos, nor, uvs, idx, asphaltMat, 'metro-carriageways');
    if (m) group.add(m);
  }
  // Planted median (piers stand here).
  {
    const mPos = [], mNor = [], mUvs = [], mIdx = [];
    const uPos = [], uNor = [], uUvs = [], uIdx = [];
    for (let i = 1; i < centre.length; i++) {
      const seg = [centre[i - 1], centre[i]];
      const isUttara = Math.min(seg[0][1], seg[1][1]) < UTTARA_Z_THRESHOLD;
      if (isUttara) {
        ribbon(seg, median, Y.median + CORRIDOR_LIFT, uPos, uNor, uUvs, uIdx, 0.3);
      } else {
        ribbon(seg, median, Y.median + CORRIDOR_LIFT, mPos, mNor, mUvs, mIdx, 0.3);
      }
    }
    if (mIdx.length) {
      const m = meshFrom(mPos, mNor, mUvs, mIdx, new THREE.MeshLambertMaterial({ color: COLORS.median }), 'metro-median');
      if (m) group.add(m);
    }
    if (uIdx.length) {
      const m = meshFrom(uPos, uNor, uUvs, uIdx, new THREE.MeshLambertMaterial({ color: 0x3d7b2a }), 'metro-median:uttara');
      if (m) group.add(m);
    }
  }
  // Footpaths (paving) both sides.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const side of [-1, 1]) {
      const centreOffset = side * (footInner + footpath / 2);
      ribbon(offsetPolyline(centre, centreOffset), footpath, Y.footpath + CORRIDOR_LIFT, pos, nor, uvs, idx, 0.3);
    }
    const m = meshFrom(pos, nor, uvs, idx, footMat, 'metro-footpaths');
    if (m) group.add(m);
  }
  // Kerbs between carriageway and footpath, both sides.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    const KERB_W = 0.25;
    const KERB_H = 0.15;
    for (const side of [-1, 1]) {
      ribbon(offsetPolyline(centre, side * footInner), KERB_W, Y.major + KERB_H + CORRIDOR_LIFT, pos, nor, uvs, idx, 0.4);
    }
    const m = meshFrom(pos, nor, uvs, idx, new THREE.MeshLambertMaterial({ color: 0xb9b3a6 }), 'metro-kerbs');
    if (m) group.add(m);
  }
  group.userData.footOuter = footOuter;
  return group;
}

let _whiteTex = null;
function whiteTex() {
  if (_whiteTex) return _whiteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  c.getContext('2d').fillRect(0, 0, 2, 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2, 2);
  _whiteTex = new THREE.CanvasTexture(c);
  _whiteTex.colorSpace = THREE.SRGBColorSpace;
  return _whiteTex;
}

function meshFrom(pos, nor, uvs, idx, material, name) {
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(
    idx.length > 65535
      ? new THREE.Uint32BufferAttribute(idx, 1)
      : new THREE.Uint16BufferAttribute(idx, 1)
  );
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.receiveShadow = true;
  return m;
}

/**
 * Asphalt texture: warm mid-dark dusty grey (Dhaka reads browner and
 * lighter than European asphalt, per reference/road/OBSERVATIONS.md),
 * with twin wheel-track bands, hard-edged patch repairs, fine gravel,
 * an edge-biased dust film, and heavily faded (broken, dusty-cream, not
 * crisp white) lane paint. `base` should already be one of the warm
 * mid-dark greys from OBSERVATIONS.md (e.g. '#5c5249'), not a neutral grey.
 */
function asphaltTexture(base = '#5c5249') {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Twin wheel-track bands: tyres polish and oil-stain two bands per lane,
  // darker and slightly desaturated relative to the untravelled asphalt.
  ctx.fillStyle = 'rgba(30,26,22,0.30)';
  for (const cx of [S * 0.28, S * 0.72]) {
    ctx.fillRect(cx - S * 0.075, 0, S * 0.15, S);
  }

  // Patch repairs: hard-edged rectangles of fresh (near-black) asphalt,
  // not soft blended blobs — real patches have a sharp saw-cut edge.
  for (let i = 0; i < 14; i++) {
    const w = 10 + rnd() * 46;
    const h = 8 + rnd() * 34;
    const x = rnd() * S;
    const y = rnd() * S;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rnd() - 0.5) * 0.3);
    ctx.fillStyle = `rgb(${34 + rnd() * 12 | 0},${30 + rnd() * 11 | 0},${26 + rnd() * 10 | 0})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Fine gravel / grit speckle: real noise both darker and lighter than
  // the base, not a uniform dark tint.
  for (let i = 0; i < 650; i++) {
    const dark = rnd() < 0.6;
    const c0 = dark ? 30 + rnd() * 40 : 110 + rnd() * 60;
    const c1 = dark ? 26 + rnd() * 36 : 100 + rnd() * 54;
    const c2 = dark ? 22 + rnd() * 32 : 88 + rnd() * 46;
    ctx.fillStyle = `rgba(${c0 | 0},${c1 | 0},${c2 | 0},${0.2 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
  }

  // Dust film biased toward the tile edges (road shoulders dust up faster
  // than the travelled centre) — warm tan, low opacity.
  const dust = ctx.createLinearGradient(0, 0, S, 0);
  dust.addColorStop(0, 'rgba(138,118,88,0.32)');
  dust.addColorStop(0.16, 'rgba(138,118,88,0.05)');
  dust.addColorStop(0.84, 'rgba(138,118,88,0.05)');
  dust.addColorStop(1, 'rgba(138,118,88,0.32)');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, S, S);

  // Faded centre line: broken, irregular, dusty cream rather than crisp
  // white, with patchy opacity as if worn unevenly by traffic.
  ctx.lineWidth = 4;
  const dashes = [[20, 16], [14, 30], [26, 20], [10, 24]];
  let dy = 0, di = 0;
  while (dy < S) {
    const [on, off] = dashes[di % dashes.length];
    const alpha = 0.14 + rnd() * 0.16;
    ctx.strokeStyle = `rgba(206,196,164,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(S / 2 + (rnd() - 0.5) * 2, dy);
    ctx.lineTo(S / 2 + (rnd() - 0.5) * 2, Math.min(S, dy + on));
    ctx.stroke();
    dy += on + off;
    di++;
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Dusty earth / concrete paving for footpaths and open ground. */
function dirtTexture(base = '#8f877a') {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  let seed = 90210;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // BUG (root cause of the pastel-ellipse regression): R, G and B were each
  // drawn from their OWN independent rnd() call. The three ranges (90-170,
  // 84-158, 72-136) were sized to keep R >= G >= B *on average*, but nothing
  // enforced that per-ellipse — an unlucky draw (low R, high B, mid G) landed
  // squarely in pastel pink/green/blue territory instead of the intended
  // warm dust tone, and at 260 ellipses per tile some always did. Fix: draw
  // ONE shared tone value `t` per ellipse and derive R/G/B from it with a
  // fixed warm ratio, so every ellipse is a lighter/darker step along the
  // same warm-neutral hue (matches OBSERVATIONS.md dust/sun-bleached range),
  // never an independently-saturated colour.
  for (let i = 0; i < 260; i++) {
    const t = rnd(); // 0=darker/cooler dust, 1=lighter/sun-bleached dust
    const r = 90 + t * 80;
    ctx.fillStyle = `rgba(${r | 0},${(r * 0.93) | 0},${(r * 0.8) | 0},${rnd() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * S, rnd() * S, 2 + rnd() * 18, 2 + rnd() * 14, rnd() * 3.14, 0, 6.283);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Low-frequency green water texture with restrained reflected-sky streaks. */
let _waterTexture = null;
function waterTexture() {
  if (_waterTexture) return _waterTexture;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  // Keep the base flat so repeating the small map never creates visible
  // horizontal bands; the low-alpha strokes carry the reflected-sky cue.
  ctx.fillStyle = '#3b716f';
  ctx.fillRect(0, 0, S, S);
  let seed = 371;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 56; i++) {
    const y = rnd() * S;
    ctx.strokeStyle = `rgba(186,221,205,${0.018 + rnd() * 0.045})`;
    ctx.lineWidth = 0.6 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(rnd() * S, y);
    ctx.lineTo(rnd() * S, y + (rnd() - 0.5) * 3);
    ctx.stroke();
  }
  _waterTexture = new THREE.CanvasTexture(canvas);
  _waterTexture.colorSpace = THREE.SRGBColorSpace;
  _waterTexture.wrapS = _waterTexture.wrapT = THREE.RepeatWrapping;
  _waterTexture.repeat.set(1.2, 1.2);
  _waterTexture.anisotropy = 4;
  return _waterTexture;
}

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------

/**
 * Place streetlights and power poles along the arterial roads, then string
 * cables between consecutive poles. The overhead wire tangle is one of the
 * most recognisable features of a Dhaka street.
 */
function buildStreetFurniture(roads, metroCentre, buildings) {
  const group = new THREE.Group();
  group.name = 'street-furniture';

  const lightPositions = [];
  const polePositions = [];

  for (const r of roads) {
    if (r.rank < 2) continue;
    const spacing = r.rank >= 4 ? 30 : 40;
    const offset = r.w / 2 + 1.1;

    let carry = 0;
    let side = 1;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;

      let d = spacing - carry;
      while (d < len) {
        const x = a[0] + ux * d;
        const z = a[1] + uz * d;
        if (r.rank >= 3) {
          lightPositions.push({
            x: x + px * offset * side,
            z: z + pz * offset * side,
            rot: Math.atan2(-px * side, -pz * side),
          });
          side *= -1;
        }
        polePositions.push({ x: x + px * (offset + 0.5), z: z + pz * (offset + 0.5) });
        d += spacing;
      }
      carry = (carry + len) % spacing;
    }
  }

  // ---------------------------------------------------------------------
  // P0-E1b (docs/OWNER-FEEDBACK-2026-09-07.md #2): OSM-edge poles now land
  // in the carriageway wherever the road under the viaduct was rebuilt from
  // the metro centreline (buildMetroCorridorRoad) instead of the OSM way.
  // Any light/pole within CENTRELINE_CLEAR of that centreline is snapped to
  // the corridor footpath edge on its own side (centreline +/- FOOT_EDGE,
  // the footpath band's midline: CORRIDOR.median/2 + carriageway +
  // footpath/2 = 1.5 + 10.5 + 1.5 = 13.5 m, matching the brief exactly), or
  // dropped if the snapped spot lands inside a building footprint.
  // ---------------------------------------------------------------------
  const CENTRELINE_CLEAR = 14; // m
  const FOOT_EDGE = CORRIDOR.median / 2 + CORRIDOR.carriageway + CORRIDOR.footpath / 2; // 13.5 m

  // Pre-filter to buildings whose centroid is anywhere near the corridor,
  // so the per-pole point-in-polygon test below doesn't scan every building
  // in the scene (there can be thousands).
  const nearbyBuildingRings = [];
  if (metroCentre && buildings) {
    for (const b of buildings) {
      const ring = b.p;
      if (!ring || ring.length < 6) continue;
      let cx = 0, cz = 0;
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        cx += ring[i * 2];
        cz += ring[i * 2 + 1];
      }
      cx /= n;
      cz /= n;
      if (distToPolyline(metroCentre, cx, cz) < 25) nearbyBuildingRings.push(ring);
    }
  }

  function insideNearbyBuilding(x, z) {
    for (const ring of nearbyBuildingRings) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        const rx = ring[i];
        const rz = ring[i + 1];
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (rz < minZ) minZ = rz;
        if (rz > maxZ) maxZ = rz;
      }
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      let inside = false;
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i * 2], zi = ring[i * 2 + 1];
        const xj = ring[j * 2], zj = ring[j * 2 + 1];
        const crosses = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (crosses) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  /** Nearest point on the metro centreline, its unit normal, and which side (x,z) falls on. */
  function nearestCentre(x, z) {
    let best = Infinity;
    let info = null;
    for (let i = 1; i < metroCentre.length; i++) {
      const a = metroCentre[i - 1];
      const b = metroCentre[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-9) continue;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const qx = a[0] + t * dx;
      const qz = a[1] + t * dz;
      const d = Math.hypot(x - qx, z - qz);
      if (d < best) {
        best = d;
        const l = Math.sqrt(l2);
        const nx = -dz / l;
        const nz = dx / l;
        const side = (x - qx) * nx + (z - qz) * nz >= 0 ? 1 : -1;
        info = { dist: d, qx, qz, nx, nz, side };
      }
    }
    return info;
  }

  let poleStats = { relocated: 0, dropped: 0 };

  /**
   * Snap p to the corridor footpath edge if it's within CENTRELINE_CLEAR of
   * the metro centreline; drop it (return null) if the snapped spot lands
   * inside a building; pass through unchanged otherwise.
   */
  function relocate(p, hasRot) {
    if (!metroCentre) return p;
    const info = nearestCentre(p.x, p.z);
    if (!info || info.dist >= CENTRELINE_CLEAR) return p;
    const nx = info.qx + info.nx * FOOT_EDGE * info.side;
    const nz = info.qz + info.nz * FOOT_EDGE * info.side;
    if (insideNearbyBuilding(nx, nz)) {
      poleStats.dropped++;
      return null;
    }
    poleStats.relocated++;
    const out = { x: nx, z: nz };
    if (hasRot) out.rot = Math.atan2(-info.nx * info.side, -info.nz * info.side);
    return out;
  }

  if (metroCentre) {
    const relocatedLights = lightPositions.map((p) => relocate(p, true)).filter(Boolean);
    lightPositions.length = 0;
    lightPositions.push(...relocatedLights);
    const relocatedPoles = polePositions.map((p) => relocate(p, false)).filter(Boolean);
    polePositions.length = 0;
    polePositions.push(...relocatedPoles);
    console.info(
      `[street-furniture] corridor poles: ${poleStats.relocated} relocated to the footpath edge, ${poleStats.dropped} dropped (would land inside a building)`
    );

    // The corridor's own footpath streetlights, every 30 m on both sides
    // (the viaduct parapet already has its own lights every pier span, see
    // metro.js "Streetlight poles on the parapet, every span").
    let carry = 0;
    for (let i = 1; i < metroCentre.length; i++) {
      const a = metroCentre[i - 1];
      const b = metroCentre[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;
      const nz = ux;
      let d = 30 - carry;
      while (d < len) {
        const x = a[0] + ux * d;
        const z = a[1] + uz * d;
        for (const side of [-1, 1]) {
          lightPositions.push({
            x: x + nx * FOOT_EDGE * side,
            z: z + nz * FOOT_EDGE * side,
            rot: Math.atan2(-nx * side, -nz * side),
          });
        }
      d += 30;
      }
    }
  }

  // Ensure no pole or streetlight is placed inside the carriageway of any road
  // (such as at intersections, T-junctions, or road curves).
  {
    const ROAD_CELL = 30;
    const roadMap = new Map();
    for (const r of roads) {
      if (r.rank < 1) continue;
      const halfW = (r.w || 6) / 2;
      for (let i = 1; i < r.pts.length; i++) {
        const p0 = r.pts[i - 1];
        const p1 = r.pts[i];
        const minX = Math.min(p0[0], p1[0]) - halfW;
        const maxX = Math.max(p0[0], p1[0]) + halfW;
        const minZ = Math.min(p0[1], p1[1]) - halfW;
        const maxZ = Math.max(p0[1], p1[1]) + halfW;
        const cx0 = Math.floor(minX / ROAD_CELL);
        const cx1 = Math.floor(maxX / ROAD_CELL);
        const cz0 = Math.floor(minZ / ROAD_CELL);
        const cz1 = Math.floor(maxZ / ROAD_CELL);
        const seg = [p0[0], p0[1], p1[0], p1[1], halfW];
        for (let x = cx0; x <= cx1; x++) {
          for (let z = cz0; z <= cz1; z++) {
            const key = x * 100000 + z;
            let list = roadMap.get(key);
            if (!list) roadMap.set(key, (list = []));
            list.push(seg);
          }
        }
      }
    }

    function insideAnyRoadCarriageway(x, z) {
      const cx = Math.floor(x / ROAD_CELL);
      const cz = Math.floor(z / ROAD_CELL);
      const list = roadMap.get(cx * 100000 + cz);
      if (!list) return false;
      for (const [ax, az, bx, bz, halfW] of list) {
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-8) {
          if (Math.hypot(x - ax, z - az) < halfW - 0.2) return true;
          continue;
        }
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx;
        const qz = az + t * dz;
        if (Math.hypot(x - qx, z - qz) < halfW - 0.2) return true;
      }
      return false;
    }

    const cleanLights = lightPositions.filter((p) => !insideAnyRoadCarriageway(p.x, p.z));
    const droppedLights = lightPositions.length - cleanLights.length;
    lightPositions.length = 0;
    lightPositions.push(...cleanLights);

    const cleanPoles = polePositions.filter((p) => !insideAnyRoadCarriageway(p.x, p.z));
    const droppedPoles = polePositions.length - cleanPoles.length;
    polePositions.length = 0;
    polePositions.push(...cleanPoles);

    if (droppedLights > 0 || droppedPoles > 0) {
      console.info(
        `[street-furniture] removed ${droppedLights} light(s) and ${droppedPoles} pole(s) encroaching on road carriageways`
      );
    }
  }

  /** True if the straight segment (ax,az)-(bx,bz) crosses the metro centreline
   * anywhere — used to keep re-strung cables off the carriageway under the
   * viaduct (a cable that never crosses the centreline can't cross the
   * carriageway band around it, since both corridor-adjacent poles now sit
   * on the footpath edge, roughly parallel to it). */
  function crossesCorridor(ax, az, bx, bz) {
    if (!metroCentre) return false;
    for (let i = 1; i < metroCentre.length; i++) {
      const c = metroCentre[i - 1];
      const d = metroCentre[i];
      const d1x = bx - ax, d1z = bz - az;
      const d2x = d[0] - c[0], d2z = d[1] - c[1];
      const denom = d1x * d2z - d1z * d2x;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((c[0] - ax) * d2z - (c[1] - az) * d2x) / denom;
      const u = ((c[0] - ax) * d1z - (c[1] - az) * d1x) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }

  const dummy = new THREE.Object3D();

  // Cobra-head streetlight: tapered grey column, curved arm, lamp head.
  if (lightPositions.length) {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.15, 9, 6);
    poleGeo.translate(0, 4.5, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x8f9296 });
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);

    const armGeo = new THREE.BoxGeometry(1.9, 0.11, 0.11);
    armGeo.translate(0.95, 9.0, 0);
    const armMesh = new THREE.InstancedMesh(armGeo, poleMat, lightPositions.length);

    const headGeo = new THREE.BoxGeometry(0.72, 0.2, 0.34);
    headGeo.translate(1.85, 8.9, 0);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xb9bcbe });
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, lightPositions.length);

    lightPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);
      armMesh.setMatrixAt(i, dummy.matrix);
      headMesh.setMatrixAt(i, dummy.matrix);
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    poleMesh.castShadow = true;
    group.add(poleMesh, armMesh, headMesh);

    // Tagged for src/destructibles.js (owner, 2026-09-07: "make sure the
    // street lights are collapsible or destroyable using the vehicle").
    // Positions in world space + pole height, so that module never has to
    // re-derive geometry from the instance matrices.
    group.userData.streetlights = {
      poleMesh, armMesh, headMesh,
      positions: lightPositions.map((p) => ({ x: p.x, z: p.z, rot: p.rot })),
      poleHeight: 9,
    };
  }

  // Square concrete power poles.
  if (polePositions.length) {
    const geo = new THREE.CylinderGeometry(0.13, 0.2, 8.5, 4);
    geo.translate(0, 4.25, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a958c });
    const mesh = new THREE.InstancedMesh(geo, mat, polePositions.length);
    polePositions.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, (i * 0.7) % Math.PI, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);

    // Crossarms.
    const armGeo = new THREE.BoxGeometry(1.5, 0.1, 0.1);
    armGeo.translate(0, 7.6, 0);
    const armMesh = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: 0x6e6a62 }), polePositions.length);
    polePositions.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, (i * 0.7) % Math.PI, 0);
      dummy.updateMatrix();
      armMesh.setMatrixAt(i, dummy.matrix);
    });
    armMesh.instanceMatrix.needsUpdate = true;
    group.add(armMesh);
  }

  // Overhead cables: sagging catenaries between nearby poles.
  const cablePts = [];
  for (let i = 1; i < polePositions.length; i++) {
    const a = polePositions[i - 1];
    const b = polePositions[i];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span > 70 || span < 3) continue;
    // P0-E1b: never string a cable across the carriageway under the
    // viaduct — skip any span whose straight line crosses the metro
    // centreline (see crossesCorridor above).
    if (crossesCorridor(a.x, a.z, b.x, b.z)) continue;
    for (let k = 0; k < 4; k++) {
      const yTop = 7.0 + k * 0.22;
      const sag = 0.5 + k * 0.12;
      const jitter = (k - 1.5) * 0.16;
      const SEG = 6;
      for (let s = 0; s < SEG; s++) {
        const t0 = s / SEG;
        const t1 = (s + 1) / SEG;
        const y0 = yTop - Math.sin(t0 * Math.PI) * sag;
        const y1 = yTop - Math.sin(t1 * Math.PI) * sag;
        cablePts.push(
          a.x + (b.x - a.x) * t0 + jitter, y0, a.z + (b.z - a.z) * t0 + jitter,
          a.x + (b.x - a.x) * t1 + jitter, y1, a.z + (b.z - a.z) * t1 + jitter
        );
      }
    }
  }
  if (cablePts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    const lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0x1c1b19, transparent: true, opacity: 0.85 })
    );
    lines.name = 'overhead-cables';
    group.add(lines);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build the full ground layer.
 * @returns {{ group: THREE.Group, stats: object }}
 */
export function buildStreets(scene) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'streets';

  const b = scene.meta.bounds;
  // sky.js's fog reaches out to fogFar=900 (its furthest daytime preset); a
  // 400 m pad left the ground plane's edge well inside that, so the aerial
  // view showed a hard polygon edge inside the haze instead of the ground
  // fading out. >=1000 keeps the plane edge past every fog preset.
  const pad = 1000;

  // Base ground plane covering the whole extract plus a margin.
  const groundW = b.maxX - b.minX + pad * 2;
  const groundH = b.maxZ - b.minZ + pad * 2;
  const groundGeo = new THREE.PlaneGeometry(groundW, groundH);
  groundGeo.rotateX(-Math.PI / 2);
  const groundTex = dirtTexture('#948b7e');
  // BUG (scale half of the pastel-ellipse regression): PlaneGeometry's UVs
  // span 0-1 across the WHOLE plane, so a fixed repeat count means the tile
  // size scales with the map's extent. This scene's bounds (~2.3km x
  // ~3.1km including the new pad) made the old fixed (120,160) work out to
  // ~19 m of ground per 256px tile — big enough to blow the texture's 2-18
  // px noise ellipses up to 1-3 m radius (2-6 m diameter) blobs, exactly
  // the "3 to 8 m" scale reported. Repeat must be computed from the actual
  // plane size, not a magic constant, so a tile always reads as ~4 m of
  // ground regardless of how big the OSM extract is.
  const groundTileM = 4;
  groundTex.repeat.set(groundW / groundTileM, groundH / groundTileM);
  // The texture already carries the ground's colour and tonal variation; a
  // tinted material colour on top of that double-darkens it, so this stays
  // white and lets the texture do the work.
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({
      map: groundTex,
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    })
  );
  ground.position.set((b.minX + b.maxX) / 2, Y.ground, (b.minZ + b.maxZ) / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // Tried a large unlit "skirt" disc beyond the ground plane here (the
  // brief's "better" alternative to just padding) to fully hide the plane's
  // horizon edge in the aerial view. Reverted: a CircleGeometry(6000, 48) —
  // only 48 triangles, +1 draw call — cut the aerial-view HUD from a steady
  // 60 fps to 16-26 fps and it did not recover after 8+ s settling, so
  // something about that large a primitive (likely full-screen overdraw
  // fighting the ground plane's depth at the horizon, or a shadow-frustum
  // interaction — not confirmed) is expensive here. Not worth a >2x aerial
  // frame-time regression to soften a horizon seam that pad=1000 already
  // pushes past every fog preset. Left as a known follow-up; see
  // docs/ROAD-PASS.md.

  // Land-use areas.
  const areaBuckets = new Map();
  for (const a of scene.areas) {
    let arr = areaBuckets.get(a.k);
    if (!arr) areaBuckets.set(a.k, (arr = []));
    arr.push(a);
  }
  const waterEdgePos = [];
  const waterBankPos = [];
  const waterBankNor = [];
  const waterBankUvs = [];
  const waterBankIdx = [];
  for (const [kind, list] of areaBuckets) {
    const isGreen = kind === 'park' || kind === 'wood' || kind === 'pitch' || kind === 'cemetery';
    if (isGreen) {
      const uttaraList = [];
      const mirpurList = [];
      for (const a of list) {
        const avgZ = a.p && a.p.length ? a.p.reduce((sum, pt) => sum + pt[1], 0) / a.p.length : 0;
        if (avgZ < UTTARA_Z_THRESHOLD) uttaraList.push(a);
        else mirpurList.push(a);
      }
      if (uttaraList.length) {
        const pos = [];
        const nor = [];
        const uvs = [];
        const idx = [];
        for (const a of uttaraList) fillPolygon(a.p, Y.area, pos, nor, uvs, idx);
        // Fresh vibrant green for planned Uttara residential parks & landscape
        const mat = new THREE.MeshLambertMaterial({ color: 0x488339, side: THREE.DoubleSide });
        const m = meshFrom(pos, nor, uvs, idx, mat, `area:${kind}:uttara`);
        if (m) group.add(m);
      }
      if (mirpurList.length) {
        const pos = [];
        const nor = [];
        const uvs = [];
        const idx = [];
        for (const a of mirpurList) fillPolygon(a.p, Y.area, pos, nor, uvs, idx);
        const colour = COLORS[kind] ?? COLORS.bare;
        const mat = new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide });
        const m = meshFrom(pos, nor, uvs, idx, mat, `area:${kind}:mirpur`);
        if (m) group.add(m);
      }
      continue;
    }

    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const a of list) fillPolygon(a.p, Y.area, pos, nor, uvs, idx);
    const colour = COLORS[kind] ?? COLORS.bare;
    // OSM area rings have no guaranteed winding, so render both sides
    // rather than risk a park or waterbody facing into the ground.
    const mat = kind === 'water'
      ? new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: waterTexture(),
        roughness: 0.2,
        metalness: 0.06,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      : new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide });
    const m = meshFrom(pos, nor, uvs, idx, mat, `area:${kind}`);
    if (m) {
      m.receiveShadow = true;
      group.add(m);
    }
    if (kind === 'water') {
      for (const a of list) {
        if (!a.p || a.p.length < 6) continue;
        for (let i = 0; i < a.p.length; i += 2) {
          const j = (i + 2) % a.p.length;
          waterEdgePos.push(a.p[i], Y.area + 0.035, a.p[i + 1], a.p[j], Y.area + 0.035, a.p[j + 1]);
          const ax = a.p[i]; const az = a.p[i + 1];
          const bx = a.p[j]; const bz = a.p[j + 1];
          const dx = bx - ax; const dz = bz - az;
          const len = Math.hypot(dx, dz) || 1;
          const px = -dz / len; const pz = dx / len;
          const bankHalf = 0.38;
          const base = waterBankPos.length / 3;
          waterBankPos.push(
            ax + px * bankHalf, Y.area + 0.052, az + pz * bankHalf,
            ax - px * bankHalf, Y.area + 0.052, az - pz * bankHalf,
            bx - px * bankHalf, Y.area + 0.052, bz - pz * bankHalf,
            bx + px * bankHalf, Y.area + 0.052, bz + pz * bankHalf
          );
          for (let k = 0; k < 4; k++) waterBankNor.push(0, 1, 0);
          waterBankUvs.push(0, 0, 1, 0, 1, len * 0.08, 0, len * 0.08);
          waterBankIdx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }
  }

  if (waterBankIdx.length) {
    const bank = meshFrom(
      waterBankPos,
      waterBankNor,
      waterBankUvs,
      waterBankIdx,
      new THREE.MeshLambertMaterial({
        color: 0x8c826d,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
      'water-banks'
    );
    if (bank) { bank.renderOrder = 2; group.add(bank); }
  }

  // A single batched shoreline keeps OSM ponds readable at grazing angles;
  // it also masks the hard green/blue polygon transition without adding one
  // object per lake.
  if (waterEdgePos.length) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterEdgePos, 3));
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: 0x284743,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }));
    edge.name = 'water-shorelines';
    edge.renderOrder = 2;
    group.add(edge);
  }

  const waterDetails = buildWaterTextureDetails(
    (scene.areas || []).filter((area) => area.k === 'water')
  );
  if (waterDetails.children.length) group.add(waterDetails);

  // Waterways as ribbons.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const w of scene.waterways) ribbon(w.pts, w.w, Y.area + 0.01, pos, nor, uvs, idx);
    const m = meshFrom(
      pos, nor, uvs, idx,
      new THREE.MeshLambertMaterial({ color: COLORS.water, side: THREE.DoubleSide }),
      'waterways'
    );
    if (m) group.add(m);
  }

  // Roads, grouped by surface class so each gets one draw call. The colour
  // lives in the texture itself (see asphaltTexture/dirtTexture); the material
  // colour stays white so it does not multiply-darken the bake. Base hexes
  // are the warm mid-dark greys from reference/road/OBSERVATIONS.md, not
  // neutral greys — Dhaka asphalt reads browner than European asphalt.
  // Nudged a shade darker than the raw OBSERVATIONS.md "typical" midpoint
  // so the OSM roads read as the same material as the corridor carriageway
  // below, whose CC0 photographic map (asphalt-patched) is itself a fairly
  // dark, only mildly warm grey (~rgb(65,65,63) sampled) — the procedural
  // base is tuned to land in the same ballpark once patches/gravel/dust
  // are layered on top, not to match it pixel-for-pixel.
  const asphaltTex = asphaltTexture('#4f483f');
  const asphaltTexMinor = asphaltTexture('#584f45');
  // Physical repeat scale: the canvas tile should read as roughly a 5 m
  // square of asphalt, not stretch across the whole carriageway width nor
  // tile so tightly it aliases/shimmers at distance. roads-major carries
  // the widest carriageways (primary ~24 m down to primary_link ~8 m), so
  // repeat.x=3 keeps a representative ~16 m road at ~5.3 m/tile; the
  // secondary/minor group spans ~4.5-11 m, so repeat.x=1.5 keeps a
  // representative ~7.5 m road at ~5 m/tile. The along-length uvScale for
  // this ribbon call is 0.09 (1 UV unit = ~11.1 m), so repeat.y=2 gives a
  // ~5.6 m tile length, matching the width-wise scale and the corridor
  // carriageway below.
  asphaltTex.repeat.set(3, 2);
  asphaltTexMinor.repeat.set(1.5, 2);
  const footTex = dirtTexture('#a89f8f');
  // Same fixed-repeat scale bug as the ground plane (see groundTex above),
  // just less extreme: this texture is shared by the OSM footpaths ribbon
  // (uvScale 0.09, so 1 UV unit = ~11.1 m of length, u spans the full
  // footpath width) below AND the arterial-flanking sidewalks ribbon further
  // down (2.4 m wide, uvScale 0.2 => 1 UV unit = 5 m). repeat(1,1) put an
  // entire 256 px tile — all 260 noise ellipses — across the whole width and
  // 5-11 m of length in one stretch, which is what turned individual 2-18 px
  // ellipses into multi-metre blobs on the footpaths, the other half of the
  // reported regression. (0.6, 1.25) keeps tiles at roughly a 4 m square for
  // the sidewalks case and close to it for the footpaths ribbon.
  footTex.repeat.set(0.6, 1.25);

  // The metro's own centreline: the primary-road ribbon is suppressed within
  // 15 m of it so the purpose-built corridor road (below) does not overlap.
  const metroCentre = scene.metro?.tracks?.length ? centreAlignment(scene.metro.tracks) : null;
  const CORRIDOR_CLEARANCE = 15;
  const roadSegments = (r) =>
    metroCentre && r.rank >= 3 ? splitAwayFromCentre(r.pts, metroCentre, CORRIDOR_CLEARANCE) : [r.pts];

  const roadGroups = [
    { name: 'roads-major', test: (r) => r.rank >= 4, y: Y.major, mat: new THREE.MeshLambertMaterial({ map: asphaltTex }) },
    { name: 'roads-secondary', test: (r) => r.rank === 3, y: Y.minor, mat: new THREE.MeshLambertMaterial({ map: asphaltTexMinor }) },
    { name: 'roads-minor', test: (r) => r.rank === 2, y: Y.service, mat: new THREE.MeshLambertMaterial({ map: asphaltTexMinor }) },
    { name: 'roads-service', test: (r) => r.rank === 1, y: Y.service, mat: new THREE.MeshLambertMaterial({ color: COLORS.asphaltService }) },
    { name: 'footpaths', test: (r) => r.rank === 0, y: Y.footpath, mat: new THREE.MeshLambertMaterial({ map: footTex }) },
  ];

  for (const rg of roadGroups) {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const r of scene.roads) {
      if (!rg.test(r)) continue;
      for (const seg of roadSegments(r)) ribbon(seg, r.w, rg.y, pos, nor, uvs, idx, 0.09);
    }
    const m = meshFrom(pos, nor, uvs, idx, rg.mat, rg.name);
    if (m) group.add(m);
  }

  const roadTextureDetails = buildRoadTextureDetails(scene.roads, roadSegments);
  if (roadTextureDetails.children.length) group.add(roadTextureDetails);

  // The main road under the viaduct, built from the metro centreline itself
  // so the piers land in the median rather than the outer lane.
  if (metroCentre) {
    // Colour here is a MULTIPLIER over the texture, not a paint. It must be
    // white once the photographic asphalt has loaded, otherwise the pale
    // placeholder tint washes the road out to near-white. Until then, fall
    // back to a dark, dusty asphalt tone rather than a light one.
    const corridorAsphaltMat = new THREE.MeshStandardMaterial({ color: 0x4a4845, roughness: 0.96, metalness: 0.0, map: whiteTex() });
    const corridorFootMat = new THREE.MeshStandardMaterial({ color: 0x8b8478, roughness: 0.92, metalness: 0.0, map: whiteTex() });
    loadTextureSet('asphalt-patched').then((set) => {
      // The carriageway ribbon's v-UV uses uvScale=0.09 (1 UV unit = ~11.1 m
      // of road length), and u spans 0-1 across the full 10.5 m carriageway
      // width. (3, 40) was a bug, not a deliberate stretch: repeat.y=40
      // tiled the map every ~0.28 m along the road, so tight it aliased
      // into a moire that mip-mapped down to a flat, washed-out grey at any
      // distance — the same visual symptom as the "roads look white"
      // complaint, just via minification instead of a colour multiply.
      // (2, 2) gives ~5.3 m tiles across the width and ~5.6 m along the
      // length, matching the OSM roads-major/-secondary repeat scale above.
      if (set.map) { set.map.repeat.set(2, 2); corridorAsphaltMat.map = set.map; }
      if (set.normalMap) { set.normalMap.repeat.set(2, 2); corridorAsphaltMat.normalMap = set.normalMap; }
      if (set.roughnessMap) { set.roughnessMap.repeat.set(2, 2); corridorAsphaltMat.roughnessMap = set.roughnessMap; }
      // Hand tone over to the photograph.
      if (set.map) corridorAsphaltMat.color.setHex(0xffffff);
      corridorAsphaltMat.needsUpdate = true;
    });
    loadTextureSet('paving-bricks').then((set) => {
      // Same aliasing bug as the carriageway above: the footpath ribbon's
      // uvScale is 0.3 (1 UV unit = ~3.3 m), so repeat.y=60 tiled the brick
      // photo every ~5.5 cm — far tighter than an actual paving brick,
      // guaranteed to shimmer/mip-blur. (3, 4) gives ~1 m tiles across the
      // 3 m footpath width and ~0.83 m along its length, brick-scale.
      if (set.map) { set.map.repeat.set(3, 4); corridorFootMat.map = set.map; }
      if (set.normalMap) { set.normalMap.repeat.set(3, 4); corridorFootMat.normalMap = set.normalMap; }
      if (set.map) corridorFootMat.color.setHex(0xffffff);
      corridorFootMat.needsUpdate = true;
    });
    group.add(buildMetroCorridorRoad(metroCentre, corridorAsphaltMat, corridorFootMat));
  }

  // Footpath strips flanking the arterials, raised above the carriageway.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    for (const r of scene.roads) {
      if (r.rank < 3) continue;
      const w = 2.4;
      for (const segPts of roadSegments(r)) {
      for (const sign of [1, -1]) {
        const offsetPts = segPts.map((p, i) => {
          const prev = segPts[Math.max(0, i - 1)];
          const next = segPts[Math.min(segPts.length - 1, i + 1)];
          let dx = next[0] - prev[0];
          let dz = next[1] - prev[1];
          const l = Math.hypot(dx, dz) || 1;
          dx /= l;
          dz /= l;
          const off = (r.w / 2 + w / 2) * sign;
          return [p[0] - dz * off, p[1] + dx * off];
        });
        ribbon(offsetPts, w, Y.footpath, pos, nor, uvs, idx, 0.2);
      }
      }
    }
    const m = meshFrom(
      pos, nor, uvs, idx,
      new THREE.MeshLambertMaterial({ map: footTex }),
      'sidewalks'
    );
    if (m) group.add(m);
  }

  // Raised kerb line at the sidewalk edge of arterial roads, so the boundary
  // between carriageway and footpath actually reads instead of blending into
  // one flat ribbon.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    const KERB_W = 0.25;
    const KERB_H = 0.15;
    for (const r of scene.roads) {
      if (r.rank < 3) continue;
      for (const segPts of roadSegments(r)) {
      for (const sign of [1, -1]) {
        const offsetPts = segPts.map((p, i) => {
          const prev = segPts[Math.max(0, i - 1)];
          const next = segPts[Math.min(segPts.length - 1, i + 1)];
          let dx = next[0] - prev[0];
          let dz = next[1] - prev[1];
          const l = Math.hypot(dx, dz) || 1;
          dx /= l;
          dz /= l;
          const off = (r.w / 2 + KERB_W / 2) * sign;
          return [p[0] - dz * off, p[1] + dx * off];
        });
        ribbon(offsetPts, KERB_W, Y.major + KERB_H, pos, nor, uvs, idx, 0.4);
      }
      }
    }
    const m = meshFrom(
      pos, nor, uvs, idx,
      new THREE.MeshLambertMaterial({ color: 0xb9b3a6 }),
      'kerbs'
    );
    if (m) group.add(m);
  }

  // Lane dashes down the centreline of arterial roads, skipped where a
  // planted median already marks the centre.
  {
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    const DASH_LEN = 3.5;
    const GAP_LEN = 4.5;
    for (const r of scene.roads) {
      if (r.rank < 3) continue;
      if (r.rank >= 4 && r.w >= 12) continue; // median already marks the centre
      for (const segPts of roadSegments(r)) {
      let carry = 0;
      for (let i = 1; i < segPts.length; i++) {
        const a = segPts[i - 1];
        const b = segPts[i];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const ux = dx / len;
        const uz = dz / len;
        let d = carry;
        while (d < len) {
          const dashEnd = Math.min(d + DASH_LEN, len);
          ribbon(
            [
              [a[0] + ux * d, a[1] + uz * d],
              [a[0] + ux * dashEnd, a[1] + uz * dashEnd],
            ],
            0.15,
            Y.marking,
            pos, nor, uvs, idx, 1
          );
          d += DASH_LEN + GAP_LEN;
        }
        carry = d - len;
      }
      }
    }
    const m = meshFrom(
      pos, nor, uvs, idx,
      new THREE.MeshLambertMaterial({ color: 0xdcd6c4, transparent: true, opacity: 0.45 }),
      'lane-dashes'
    );
    if (m) group.add(m);
  }

  // Planted central median on the widest roads, which is also where the metro
  // piers land.
  {
    const mPos = [], mNor = [], mUvs = [], mIdx = [];
    const uPos = [], uNor = [], uUvs = [], uIdx = [];
    for (const r of scene.roads) {
      if (r.rank < 4 || r.w < 12) continue;
      for (const seg of roadSegments(r)) {
        const isUttara = seg.some((p) => p[1] < UTTARA_Z_THRESHOLD);
        if (isUttara) {
          ribbon(seg, 1.6, Y.median, uPos, uNor, uUvs, uIdx, 0.3);
        } else {
          ribbon(seg, 1.6, Y.median, mPos, mNor, mUvs, mIdx, 0.3);
        }
      }
    }
    if (mIdx.length) {
      const m = meshFrom(mPos, mNor, mUvs, mIdx, new THREE.MeshLambertMaterial({ color: COLORS.median }), 'medians');
      if (m) group.add(m);
    }
    if (uIdx.length) {
      const m = meshFrom(uPos, uNor, uUvs, uIdx, new THREE.MeshLambertMaterial({ color: 0x3d7b2a }), 'medians:uttara');
      if (m) group.add(m);
    }
  }

  group.add(buildStreetFurniture(scene.roads, metroCentre, scene.buildings));

  return {
    group,
    stats: {
      drawCalls: group.children.length,
      ms: Math.round(performance.now() - t0),
    },
  };
}
