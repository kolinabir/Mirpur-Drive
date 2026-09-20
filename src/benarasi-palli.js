/**
 * benarasi-palli.js
 *
 * Mirpur Benarasi Palli — the Benarasi saree market in Section 10, Block A,
 * founded by weavers who came from Varanasi in the 1960s. Hand-modelled like
 * sangsad.js, landmarks.js and stadium.js.
 *
 * PLAN — surveyed. OpenStreetMap gives seven ways named "Benaroshi Polli
 * Road" (~1.2 km of lane) and 18 named saree shops, all `shop=clothes`.
 * Every shop coordinate below is an OSM node in scene metres.
 *
 * ELEVATION — from the Wikimedia Commons photograph "A gate of Mirpur
 * Benarashi Palli, Dhaka, 2014", written up in
 * reference/benarasi/OBSERVATIONS.md. The market's signature is RED AND
 * WHITE: a dark red signboard beam spanning the road with large white Bangla
 * lettering, carried on red-and-white banded columns, and a colonnade over
 * the footpath in the same banding under a continuous red fascia carrying
 * white shop names.
 *
 * The gate POSITION is inferred, not photographed in place — see the
 * reference doc. It stands where OSM's "Benaroshi Polli Road" meets
 * Mirpur Road-13, the entrance to the lane that carries the market's name.
 *
 * Cost: three draw calls (structure, gate lettering, shop fascias), ~1.5k
 * triangles, no lights.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Where "Benaroshi Polli Road" (OSM way 33778492) meets Mirpur Road-13. */
const GATE = [362.6, 719.2];
/** The next node up the lane, which gives the gate its facing. */
const GATE_INTO = [346.8, 685.5];

/** The 18 OSM-named saree shops, scene metres (+X east, +Z south). */
const SHOPS = [
  { name: 'মাইশা বেনারসি হাউস', en: 'Maisha Benaroshi House', x: 349.8, z: 339.6 },
  { name: 'বেনারসি কুঠি', en: 'Benaroshi Kuthi', x: 284.9, z: 423 },
  { name: 'বৃষ্টি বেনারসি সিল্ক', en: 'Bristy Benaroshi Silk House', x: 425.4, z: 102.3 },
  { name: 'সাদিয়া বেনারসি হাউস', en: 'Sadia Benaroshi House', x: 298.2, z: 190.2 },
  { name: 'বেনারসি আঁচল', en: 'Benaroshi Achan', x: 285.9, z: 295 },
  { name: 'বেনারসি কুঠি', en: 'Benaroshi Kuthi', x: 231.6, z: 315.9 },
  { name: 'আপন বেনারসি', en: 'Apan Benaroshi', x: 327.5, z: 369 },
  { name: 'বেনারসি চয়েস', en: 'Benaroshi Choice', x: 311.1, z: 234.1 },
  { name: 'গোল্ডেন বেনারসি হাউস', en: 'Golden Benaroshi House', x: 273.5, z: 236.9 },
  { name: 'মিরপুর বেনারসি হাউস', en: 'Mirpur Benaroshi House', x: 244.7, z: 280.2 },
  { name: 'পাবনা বেনারসি মিউজিয়াম', en: 'Pabna Benaroshi Museum', x: 256.2, z: 316.2 },
  { name: 'লাল বেনারসি', en: 'Lal Benaroshi', x: 334.9, z: 319.6 },
  { name: 'বেনারসি চয়েস', en: 'Benaroshi Choice', x: 311.2, z: 238.3 },
  { name: 'আল-হামদ বেনারসি', en: 'Al-Hamd Benaroshi', x: 230.2, z: 265.8 },
  { name: 'বেনারসি ওয়ার্ল্ড', en: 'Benaroshi World', x: 243.3, z: 246.6 },
  { name: 'মনিকা বেনারসি শাড়ি', en: 'Monica Benaroshi Sharee', x: 357.5, z: 406.5 },
  { name: 'রেসা বেনারসি', en: 'Resa Benaroshi', x: 356.1, z: 397.7 },
  { name: 'বেনারসি কিং', en: 'Benaroshi King', x: 281.1, z: 408.2 },
];

const RED = 0xa8241f;
const WHITE = 0xece7db;

const CANOPY_Y = 3.4;    // underside of the shopfront canopy
const FASCIA_H = 0.95;   // red name board above it
const COL_W = 0.42;      // banded column
const BAY_HALF = 3.2;    // half-width of one shopfront bay
const CANOPY_D = 2.6;    // how far the canopy reaches over the footpath

const GATE_CLEAR = 6.6;   // underside of the gate beam
const GATE_BEAM_H = 1.7;
/** How far up the lane the gate stands, so it clears Mirpur Road-13 entirely. */
const GATE_INSET = 17;
/** Footpath margin kept between any structure and the edge of a carriageway. */
const KERB_CLEAR = 1.0;

const BANGLA = '"Noto Sans Bengali", "Hind Siliguri", Arial, sans-serif';

const unit = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };

/** Box centred at (x,y,z), sized (w,h,d), yawed about Y. */
function box(w, h, d, x, y, z, yaw = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

/** Strip every attribute mergeGeometries would choke on, then vertex-colour. */
function painted(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A square column painted in alternating red and white bands. */
function bandedColumn(x, z, height, yaw, parts) {
  const BAND = 0.55;
  const n = Math.max(2, Math.round(height / BAND));
  for (let i = 0; i < n; i++) {
    const h = height / n;
    parts.push(painted(box(COL_W, h, COL_W, x, h * (i + 0.5), z, yaw), i % 2 ? WHITE : RED));
  }
}

/**
 * Nearest modelled road to a point, with its width — everything this module
 * places is measured out from the carriageway EDGE, never from a fixed
 * offset, so no column or sign board can end up in the road (owner,
 * 2026-09-20: "make sure the gates on anything or buildings arent in middle
 * of the road").
 */
function nearestRoad(scene, x, z) {
  let best = Infinity;
  let hit = null;
  for (const r of scene.roads || []) {
    if (r.rank < 1) continue;
    const pts = r.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      const cx = a[0] + t * vx;
      const cz = a[1] + t * vz;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best) {
        best = d;
        hit = { x: cx, z: cz, dist: d, halfW: (r.w || 5.5) / 2, name: r.name || null };
      }
    }
  }
  if (!hit || best > 90) return null;
  const [nx, nz] = unit(x - hit.x, z - hit.z);
  return { ...hit, nx, nz };
}

/**
 * Smallest gap between a point and the edge of ANY modelled carriageway.
 * nearestRoad() alone is not enough: a shopfront can stand clear of the lane
 * it fronts and still overhang a second lane crossing behind it.
 * Negative means the point is inside a carriageway.
 */
function clearanceAt(scene, x, z) {
  let worst = Infinity;
  for (const r of scene.roads || []) {
    if (r.rank < 1) continue;
    const pts = r.pts;
    const half = (r.w || 5.5) / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      const d = Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz);
      if (d - half < worst) worst = d - half;
    }
  }
  return worst;
}

/** Is (x,z) inside this building footprint? Ray cast, footprints are flat [x,z,...]. */
function insideFootprint(p, x, z) {
  let hit = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2];
    const zi = p[i * 2 + 1];
    const xj = p[j * 2];
    const zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Does any probe point fall inside a building? Clearing the carriageway is
 * not enough — where a block is built right out to the kerb there is no
 * footpath, and a colonnade placed off the road alone ends up buried in the
 * building behind it.
 */
function hitsBuilding(scene, probes, near) {
  for (const b of scene.buildings || []) {
    if (Math.hypot(b.p[0] - near[0], b.p[1] - near[1]) > 70) continue;
    for (const [px, pz] of probes) if (insideFootprint(b.p, px, pz)) return true;
  }
  return false;
}

/**
 * The road-facing wall of the building a shop sits in.
 *
 * city.js already clips these footprints at the carriageway edge, so the
 * wall IS the kerb line here — the blocks are built right out to the street
 * and there is no footpath to stand a freestanding colonnade on. The bay is
 * therefore attached flush to this wall, the way landmarks.js skins the
 * BFC/KFC tower, rather than planted in front of it.
 *
 * Returns the midpoint of the chosen edge, its outward normal, and how much
 * straight frontage is available either side.
 */
function shopFrontage(scene, shop, road) {
  let best = null;
  for (const b of scene.buildings || []) {
    if (Math.hypot(b.p[0] - shop.x, b.p[1] - shop.z) > 60) continue;
    const n = b.p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = b.p[i * 2];
      const az = b.p[i * 2 + 1];
      const bx = b.p[j * 2];
      const bz = b.p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 3.0) continue;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const [ux, uz] = unit(bx - ax, bz - az);
      // Outward normal: whichever side of the edge is NOT inside the footprint.
      let nx = uz;
      let nz = -ux;
      if (insideFootprint(b.p, mx + nx * 0.6, mz + nz * 0.6)) { nx = -nx; nz = -nz; }
      // It must face the road, and sit close to it.
      const toRoad = unit(road.x - mx, road.z - mz);
      if (nx * toRoad[0] + nz * toRoad[1] < 0.55) continue;
      const distToRoad = Math.hypot(road.x - mx, road.z - mz);
      const score = distToRoad + Math.hypot(mx - shop.x, mz - shop.z) * 0.6;
      if (!best || score < best.score) {
        best = { x: mx, z: mz, nx, nz, len, score, ux, uz };
      }
    }
  }
  return best;
}

/** One canvas holding every shop's name board, so all fascias share a texture. */
function fasciaAtlas(shops) {
  const CELL_W = 1024;
  const CELL_H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W;
  canvas.height = CELL_H * shops.length;
  const ctx = canvas.getContext('2d');
  shops.forEach((shop, i) => {
    const y = i * CELL_H;
    ctx.fillStyle = '#a8241f';
    ctx.fillRect(0, y, CELL_W, CELL_H);
    ctx.fillStyle = '#ece7db';
    ctx.fillRect(0, y + CELL_H - 7, CELL_W, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 60px ${BANGLA}`;
    ctx.fillText(shop.name, CELL_W / 2, y + CELL_H * 0.40);
    ctx.font = '600 30px Arial, sans-serif';
    ctx.fillStyle = '#f2d9b0';
    ctx.fillText(shop.en.toUpperCase(), CELL_W / 2, y + CELL_H * 0.74);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The gate's lettering, painted onto its own texture. */
function gateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a8241f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ece7db';
  ctx.lineWidth = 7;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 132px ${BANGLA}`;
  ctx.fillText('মিরপুর বেনারশী পল্লী', canvas.width / 2, canvas.height * 0.44);
  ctx.font = '600 46px Arial, sans-serif';
  ctx.fillStyle = '#f2d9b0';
  ctx.fillText('MIRPUR BENAROSHI POLLI', canvas.width / 2, canvas.height * 0.78);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * @param {{ scene: object, collision?: object }} deps
 */
export function buildBenarasiPalli({ scene, collision }) {
  const group = new THREE.Group();
  group.name = 'benarasi-palli';

  const parts = [];
  const walls = [];

  // --- The gate ------------------------------------------------------------
  // The junction node itself sits ON Mirpur Road-13, so the gate is set back
  // up the lane and its span is taken from that lane's real width.
  const [ix, iz] = unit(GATE_INTO[0] - GATE[0], GATE_INTO[1] - GATE[1]); // into the lane
  const gx = GATE[0] + ix * GATE_INSET;
  const gz = GATE[1] + iz * GATE_INSET;
  const lane = nearestRoad(scene, gx, gz);
  const gateHalf = (lane ? lane.halfW : 2.75) + KERB_CLEAR + COL_W;
  const ax = -iz;
  const az = ix;                                               // across the lane
  const gateYaw = Math.atan2(ix, iz);

  for (const side of [1, -1]) {
    bandedColumn(gx + ax * gateHalf * side, gz + az * gateHalf * side, GATE_CLEAR + GATE_BEAM_H, gateYaw, parts);
  }
  // Beam ends and back face are plain red; the two long faces carry the sign.
  parts.push(painted(
    box(gateHalf * 2 + COL_W, GATE_BEAM_H, 0.5, gx, GATE_CLEAR + GATE_BEAM_H / 2, gz, gateYaw),
    RED
  ));
  // Cornice over the beam.
  parts.push(painted(
    box(gateHalf * 2 + 1.0, 0.22, 0.75, gx, GATE_CLEAR + GATE_BEAM_H + 0.11, gz, gateYaw),
    WHITE
  ));

  // The lettering itself: a thin panel on each face of the beam.
  const signGeoms = [];
  for (const face of [1, -1]) {
    const g = new THREE.PlaneGeometry(gateHalf * 2, GATE_BEAM_H * 0.92);
    g.rotateY(gateYaw + (face > 0 ? 0 : Math.PI));
    g.translate(gx + ix * 0.27 * face, GATE_CLEAR + GATE_BEAM_H / 2, gz + iz * 0.27 * face);
    signGeoms.push(g);
  }
  const gateSign = new THREE.Mesh(
    mergeGeometries(signGeoms),
    new THREE.MeshLambertMaterial({ map: gateTexture() })
  );
  gateSign.name = 'benarasi:gate-sign';
  group.add(gateSign);

  // The gate's columns are real obstacles; the beam clears traffic overhead.
  const clearances = [];
  for (const side of [1, -1]) {
    const cx = gx + ax * gateHalf * side;
    const cz = gz + az * gateHalf * side;
    walls.push([cx - ax * 0.3, cz - az * 0.3, cx + ax * 0.3, cz + az * 0.3, 0, GATE_CLEAR]);
    clearances.push({ what: 'gate column', clear: clearanceAt(scene, cx, cz) });
  }

  // --- Shopfront colonnade -------------------------------------------------
  const placed = [];
  const skipped = [];
  const fasciaGeoms = [];
  const cells = SHOPS.length;

  SHOPS.forEach((shop, i) => {
    const road = nearestRoad(scene, shop.x, shop.z);
    if (!road) return;
    // Outer face of the colonnade sits a clear metre beyond the carriageway
    // edge; the columns and canopy sit behind that, toward the building.
    const outer = road.halfW + KERB_CLEAR;
    if (road.dist < outer + 0.8) return; // no footpath to stand a colonnade on
    const front = shopFrontage(scene, shop, road);
    if (!front) { skipped.push(shop.en); return; }

    // Bay width is limited by the wall it sits on.
    const bayHalf = Math.min(BAY_HALF, front.len / 2 - 0.3);
    if (bayHalf < 1.6) { skipped.push(shop.en); return; }

    // Flush to the wall, leaning out over the street by the canopy depth.
    const cx = front.x + front.nx * 0.12;
    const cz = front.z + front.nz * 0.12;
    const tx = front.ux;
    const tz = front.uz;
    const yaw = Math.atan2(front.nx, front.nz);
    const canopyOut = Math.min(CANOPY_D, Math.max(0.6, clearanceAt(scene, cx, cz) - 0.3));

    // Every part of the bay must still clear the carriageway.
    const probes = [];
    for (const alongF of [-1, 0, 1]) {
      for (const outF of [0, canopyOut]) {
        probes.push([
          cx + tx * bayHalf * alongF + front.nx * outF,
          cz + tz * bayHalf * alongF + front.nz * outF,
        ]);
      }
    }
    const bayClear = Math.min(...probes.map(([px, pz]) => clearanceAt(scene, px, pz)));
    if (bayClear < 0.15) { skipped.push(shop.en); return; }

    // Pilasters against the wall, carrying a canopy out over the footpath.
    for (const side of [1, -1]) {
      bandedColumn(cx + tx * bayHalf * side + front.nx * canopyOut,
        cz + tz * bayHalf * side + front.nz * canopyOut, CANOPY_Y, yaw, parts);
    }
    parts.push(painted(
      box(bayHalf * 2 + COL_W, 0.22, canopyOut + 0.2,
        cx + front.nx * canopyOut * 0.5, CANOPY_Y + 0.11, cz + front.nz * canopyOut * 0.5, yaw),
      WHITE
    ));
    // Red fascia board on the street-facing edge of the canopy.
    const f = new THREE.PlaneGeometry(bayHalf * 2, FASCIA_H);
    const uv = f.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setY(k, (cells - i - 1 + uv.getY(k)) / cells);
    }
    f.rotateY(yaw);
    f.translate(
      cx + front.nx * (canopyOut + 0.12),
      CANOPY_Y + 0.22 + FASCIA_H / 2,
      cz + front.nz * (canopyOut + 0.12)
    );
    fasciaGeoms.push(f);
    placed.push(shop.en);
    clearances.push({ what: shop.en, clear: bayClear });
  });

  const structure = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  structure.name = 'benarasi:structure';
  structure.castShadow = true;
  group.add(structure);

  if (fasciaGeoms.length) {
    const fascias = new THREE.Mesh(
      mergeGeometries(fasciaGeoms),
      new THREE.MeshLambertMaterial({ map: fasciaAtlas(SHOPS), side: THREE.DoubleSide })
    );
    fascias.name = 'benarasi:fascias';
    group.add(fascias);
  }

  collision?.addSegments?.(walls);

  let triangles = 0;
  group.traverse((o) => {
    if (o.geometry) triangles += o.geometry.attributes.position.count / 3;
  });

  // Smallest gap between anything this module placed and the edge of the
  // carriageway beside it. Must stay positive.
  const worst = clearances.reduce((a, b) => (b.clear < a.clear ? b : a), { what: '-', clear: Infinity });

  return {
    group,
    gate: { x: gx, z: gz },
    stats: {
      drawCalls: group.children.length,
      triangles: Math.round(triangles),
      shops: placed.length,
      skipped: skipped.length,
      minKerbClearance: Number.isFinite(worst.clear) ? +worst.clear.toFixed(2) : null,
      tightest: worst.what,
    },
  };
}
