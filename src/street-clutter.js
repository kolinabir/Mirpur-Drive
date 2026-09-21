/**
 * street-clutter.js
 *
 * The layer of stuff that makes a Dhaka street look used: posters and চিকা
 * (wall writing) on the metro pillars, festoon strings over the side roads,
 * bamboo scaffolding with its green net and tin hoarding, sand and brick
 * piles, rows of parked rickshaws by the stations, dogs asleep on the median,
 * and laundry on the roofs.
 *
 * Budget: about a dozen draw calls in view. Everything is either a merged
 * mesh (decals, nets, hoardings: a few thousand triangles map-wide; cloth in
 * 400 m tiles that are dropped by distance and frustum) or an InstancedMesh
 * handed to src/instance-cull.js. Nothing here collides: it is dressing, and a pile the player cannot walk through is a
 * worse bug than one they can.
 *
 * Cloth (festoon pennants, laundry) and the dogs' breathing move in the
 * vertex shader, so the per-frame cost is one uniform.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARRIAGEWAY_HALF, getClippedFootprint, resolveCollision } from './city.js';
import { createInstanceCuller } from './instance-cull.js';
import { vehicleGeometry } from './vehicle-models.js';

const RANGE = 380; // m; piles and parked rickshaws beyond this are not drawn
const SMALL_RANGE = 170; // m; a 9 cm bamboo pole or a sleeping dog is under a pixel well before this
const RICKSHAW_NEAR = 55; // m; parked rickshaws swap to traffic.js's far model beyond this (852 -> ~60 triangles)
const CORRIDOR_BAND = 430; // m either side of the metro line that gets dressed at all
const CLOTH_TILE = 600; // m; big tiles: cloth is a few thousand cheap triangles, draw calls cost more than vertices
const CLOTH_RANGE = 300; // m; pennants and shirts are small, so they go before the bamboo does
const BN_FONT = '"Noto Sans Bengali", "Kohinoor Bangla", "Nirmala UI", sans-serif';

// Fictional and non-partisan on purpose: councillor-election symbols (kite,
// spinning top), an Eid greeting, tuition notices, and a lot of to-lets.
const POSTERS = [
  { bg: '#0b6b3a', fg: '#ffffff', accent: '#f2c744', head: 'ঈদ মোবারক', sub: 'এলাকাবাসীকে শুভেচ্ছা', foot: 'সৌজন্যে: মিরপুর যুব সংঘ', face: true },
  { bg: '#b3171d', fg: '#ffffff', accent: '#ffe08a', head: 'দোয়া প্রার্থী', sub: 'কাউন্সিলর পদপ্রার্থী', foot: 'মার্কা: ঘুড়ি', face: true },
  { bg: '#f4f1e6', fg: '#14213d', accent: '#c1121f', head: 'ভোট দিন', sub: 'উন্নয়নের পক্ষে', foot: 'মার্কা: লাটিম', face: true },
  { bg: '#ffd400', fg: '#111111', accent: '#c1121f', head: 'TO-LET', sub: 'বাসা ভাড়া হবে', foot: 'ফ্যামিলি · ২ বেড · ৩য় তলা' },
  { bg: '#1d3f8f', fg: '#ffffff', accent: '#ffd400', head: 'কোচিং', sub: 'ভর্তি চলছে · SSC / HSC', foot: 'মিরপুর ১০ গোলচত্বর' },
  { bg: '#ffffff', fg: '#b3171d', accent: '#111111', head: 'পড়াতে চাই', sub: 'প্রথম–দশম শ্রেণি', foot: 'সকল বিষয় · বাসায় গিয়ে' },
  { bg: '#ffffff', fg: '#c1121f', accent: '#16161a', head: 'টু-লেট', sub: 'ফ্ল্যাট ভাড়া হবে', foot: '৩ বেড · লিফট · গ্যাস' },
  { bg: '#fdf3c7', fg: '#14213d', accent: '#c1121f', head: 'সাবলেট', sub: 'ব্যাচেলর / ছাত্র · মেস সিট খালি', foot: 'যোগাযোগ: ০১৭' },
];
const CHIKA = [
  { color: '#b3171d', text: 'এখানে পোস্টার লাগানো নিষেধ' },
  { color: '#16213e', text: 'দেয়ালে লিখবেন না' },
  { color: '#b3171d', text: 'এখানে প্রস্রাব করা নিষেধ' },
  { color: '#0b6b3a', text: 'শুভ নববর্ষ ১৪৩৩' },
  { color: '#16213e', text: 'পড়াতে চাই · ০১৭' },
  { color: '#b3171d', text: 'মিরপুর আমাদের গর্ব' },
];
const PENNANTS = [0xc1121f, 0x0b6b3a, 0xf2c744, 0x1d3f8f, 0xf4f1e6, 0xe85d04];
const NATIONAL = [0x0b6b3a, 0xc1121f];
const CLOTHES = [0xf4f1e6, 0xc1121f, 0x1d3f8f, 0xf2c744, 0x7b2d8b, 0x0b8f6a, 0xe85d04, 0x3a3a44, 0xe9a6b8, 0x9fd0e8];
const DOG_COATS = [0xb98a55, 0x8a5a33, 0x2a2622, 0xd9c8a6, 0x6e4a2c];
const BAMBOO = [0xc2a15c, 0xb08d4a, 0xd1b673, 0x9c7c3e];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };

// ---------------------------------------------------------------------------
// Decal atlas: 8 posters (top half) and 6 wall-writing strips (bottom half)
// ---------------------------------------------------------------------------

const ATLAS = 1024;
const POSTER_W = 182; const POSTER_H = 252;
const posterRect = (i) => ({ x: (i % 4) * 256 + 37, y: Math.floor(i / 4) * 256 + 2, w: POSTER_W, h: POSTER_H });
const chikaRect = (i) => ({ x: (i % 2) * 512 + 6, y: 512 + Math.floor(i / 2) * 128 + 6, w: 500, h: 116 });
const rectUv = (r) => [r.x / ATLAS, 1 - (r.y + r.h) / ATLAS, (r.x + r.w) / ATLAS, 1 - r.y / ATLAS];

function drawAtlas(ctx) {
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  const rnd = mulberry32(77);
  POSTERS.forEach((p, i) => {
    const r = posterRect(i);
    ctx.fillStyle = p.bg; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = p.accent; ctx.fillRect(r.x, r.y, r.w, 10); ctx.fillRect(r.x, r.y + r.h - 34, r.w, 34);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let top = r.y + 50;
    if (p.face) {
      // An anonymous head-and-shoulders, the way every candidate poster is laid out.
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 66, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.bg; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 56, 15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + 96, 27, 20, 0, Math.PI, 0); ctx.fill();
      top = r.y + 140;
    }
    ctx.fillStyle = p.fg;
    ctx.font = `700 ${p.face ? 30 : 40}px ${BN_FONT}`; ctx.fillText(p.head, r.x + r.w / 2, top, r.w - 14);
    ctx.font = `600 17px ${BN_FONT}`; ctx.fillText(p.sub, r.x + r.w / 2, top + (p.face ? 38 : 52), r.w - 14);
    ctx.fillStyle = p.bg === '#ffffff' || p.bg === '#f4f1e6' || p.bg === '#ffd400' ? '#111111' : p.bg;
    ctx.font = `600 14px ${BN_FONT}`; ctx.fillText(p.foot, r.x + r.w / 2, r.y + r.h - 17, r.w - 12);
    // Weathering: sun-bleach and the odd torn corner.
    ctx.fillStyle = `rgba(255,250,235,${0.08 + rnd() * 0.16})`; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (rnd() < 0.6) { ctx.clearRect(r.x + (rnd() < 0.5 ? 0 : r.w - 26), r.y + r.h - 22, 26, 22); }
  });
  CHIKA.forEach((c, i) => {
    const r = chikaRect(i);
    // Whitewash first, then the sign-painter's brush: the patch is the tell.
    ctx.fillStyle = 'rgba(238,234,222,0.96)';
    ctx.beginPath();
    ctx.moveTo(r.x + 8, r.y + 10);
    for (let x = 0; x <= r.w - 16; x += 40) ctx.lineTo(r.x + 8 + x, r.y + 6 + rnd() * 8);
    ctx.lineTo(r.x + r.w - 6, r.y + r.h - 10);
    for (let x = r.w - 16; x >= 0; x -= 40) ctx.lineTo(r.x + 8 + x, r.y + r.h - 6 - rnd() * 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 50px ${BN_FONT}`;
    ctx.fillText(c.text, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 40);
    ctx.fillStyle = 'rgba(90,80,70,0.13)';
    for (let k = 0; k < 14; k++) ctx.fillRect(r.x + rnd() * r.w, r.y + rnd() * r.h, 2 + rnd() * 3, 10 + rnd() * 40);
  });
}

function buildAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS; canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  drawAtlas(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // The Bengali webfont loads without blocking the page (index.html), so the
  // first draw may have used a system face; redraw once it is really there.
  document.fonts?.load(`700 40px "Noto Sans Bengali"`, 'মিরপুর').then((faces) => {
    if (!faces?.length) return;
    drawAtlas(ctx); texture.needsUpdate = true;
  }).catch(() => {});
  return texture;
}

function tinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 64; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / 64) * Math.PI * 8);
    const shade = Math.round(118 + v * 58);
    ctx.fillStyle = `rgb(${shade - 8},${shade},${shade + 10})`;
    ctx.fillRect(x, 0, 1, 64);
  }
  const rnd = mulberry32(5);
  ctx.fillStyle = 'rgba(122,62,28,0.35)';
  for (let k = 0; k < 9; k++) ctx.fillRect(rnd() * 64, 40 + rnd() * 24, 3 + rnd() * 6, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------------------
// Geometry accumulators
// ---------------------------------------------------------------------------

/** Textured quads facing a horizontal normal, accumulated into one mesh. */
function quadBatch() {
  const pos = []; const nor = []; const uv = []; const idx = [];
  return {
    /** Centre (x, y, z), half-extent along tangent (tx, tz), half height, outward normal, uv rect, roll (rad), lean (x/y of the face). */
    add(x, y, z, tx, tz, halfW, halfH, nx, nz, rect, roll = 0, lean = 0) {
      const base = pos.length / 3;
      const c = Math.cos(roll); const s = Math.sin(roll);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const u = a * halfW * c - b * halfH * s;
        const v = a * halfW * s + b * halfH * c;
        pos.push(x + tx * u + nx * v * lean, y + v, z + tz * u + nz * v * lean);
        nor.push(nx, 0, nz);
      }
      uv.push(rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    },
    get count() { return idx.length / 6; },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    },
  };
}

/** Coloured cloth triangles/quads that flap in the vertex shader (see swayMaterial). */
function clothBatch() {
  const pos = []; const nor = []; const col = []; const sway = []; const idx = [];
  const tint = new THREE.Color();
  function vertex(x, y, z, nx, nz, hex, weight, phase, shade = 1) {
    pos.push(x, y, z); nor.push(nx, 0.25, nz);
    tint.setHex(hex).multiplyScalar(shade); col.push(tint.r, tint.g, tint.b);
    sway.push(nx * weight, nz * weight, phase);
  }
  return {
    /** A pennant hanging from (x, y, z) on a string running along (tx, tz). */
    pennant(x, y, z, tx, tz, w, h, hex, phase) {
      const base = pos.length / 3; const nx = -tz; const nz = tx;
      vertex(x - tx * w, y, z - tz * w, nx, nz, hex, 0, phase);
      vertex(x + tx * w, y, z + tz * w, nx, nz, hex, 0, phase);
      vertex(x, y - h, z, nx, nz, hex, 0.22, phase, 0.86);
      idx.push(base, base + 1, base + 2);
    },
    /** A hanging rectangle pinned along its top edge. */
    sheet(x, y, z, tx, tz, w, h, hex, phase, weight = 0.16) {
      const base = pos.length / 3; const nx = -tz; const nz = tx;
      vertex(x - tx * w, y, z - tz * w, nx, nz, hex, 0, phase);
      vertex(x + tx * w, y, z + tz * w, nx, nz, hex, 0, phase);
      vertex(x + tx * w, y - h, z + tz * w, nx, nz, hex, weight, phase, 0.84);
      vertex(x - tx * w, y - h, z - tz * w, nx, nz, hex, weight, phase + 0.6, 0.84);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    },
    /** The string itself: a thin dark ribbon between two points. */
    line(ax, ay, az, bx, by, bz) {
      const base = pos.length / 3;
      for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [bx, by - 0.03, bz], [ax, ay - 0.03, az]]) vertex(x, y, z, 0, 0, 0x1c1c1c, 0, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    },
    get triangles() { return idx.length / 3; },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 3));
      g.setIndex(idx);
      return g;
    },
  };
}

/** Lambert, vertex-coloured, displaced along the `sway` attribute by a gusty sine. */
function swayMaterial(uniforms) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clutterTime = uniforms.time;
    shader.uniforms.clutterWind = uniforms.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 sway;\nuniform float clutterTime;\nuniform float clutterWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gust = sin(clutterTime * 2.3 + sway.z + position.x * 0.31 + position.z * 0.27) * 0.65
          + sin(clutterTime * 4.1 + sway.z * 1.7) * 0.35;
        transformed.xz += sway.xy * gust * clutterWind;
        transformed.y += abs(gust) * length(sway.xy) * 0.35 * clutterWind;`);
  };
  return material;
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

function corridorOf(centre) {
  const cum = [0];
  for (let i = 1; i < centre.length; i++) cum.push(cum[i - 1] + Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]));
  const total = cum[cum.length - 1];
  function at(d) {
    const want = Math.max(0, Math.min(total, d));
    let lo = 0; let hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= want) lo = mid; else hi = mid; }
    const a = centre[lo]; const b = centre[hi];
    const len = cum[hi] - cum[lo] || 1;
    const t = (want - cum[lo]) / len;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / len, uz: (b[1] - a[1]) / len };
  }
  // Queried a few thousand times while dressing the map; a walk over all ~700
  // segments each time was a third of this module's build. Anything further
  // than one cell from the line reports Infinity, which every caller treats
  // as "outside the dressed band".
  const CELL = 480;
  const grid = new Map();
  for (let i = 1; i < centre.length; i++) {
    const key = `${Math.floor(centre[i][0] / CELL)},${Math.floor(centre[i][1] / CELL)}`;
    let list = grid.get(key); if (!list) grid.set(key, (list = []));
    list.push(i);
  }
  function nearest(x, z) {
    let best = Infinity; let bestD = 0;
    const gx = Math.floor(x / CELL); const gz = Math.floor(z / CELL);
    for (let cx = gx - 1; cx <= gx + 1; cx++) for (let cz = gz - 1; cz <= gz + 1; cz++) for (const i of grid.get(`${cx},${cz}`) ?? []) {
      const ax = centre[i - 1][0]; const az = centre[i - 1][1];
      const dx = centre[i][0] - ax; const dz = centre[i][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; bestD = cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
    }
    return { dist: best, d: bestD };
  }
  return { total, at, nearest };
}

/** Rank >= minRank road segments hashed into cells, for "which edge of this building faces a street". */
function roadIndex(roads, minRank, cell = 80) {
  const grid = new Map();
  for (const road of roads) {
    if (road.rank < minRank) continue;
    for (let i = 1; i < road.pts.length; i++) {
      const seg = [road.pts[i - 1][0], road.pts[i - 1][1], road.pts[i][0], road.pts[i][1], road.w ?? 8];
      const x0 = Math.floor(Math.min(seg[0], seg[2]) / cell); const x1 = Math.floor(Math.max(seg[0], seg[2]) / cell);
      const z0 = Math.floor(Math.min(seg[1], seg[3]) / cell); const z1 = Math.floor(Math.max(seg[1], seg[3]) / cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx},${cz}`;
        let list = grid.get(key); if (!list) grid.set(key, (list = []));
        list.push(seg);
      }
    }
  }
  return (x, z) => {
    let best = null;
    const cx = Math.floor(x / cell); const cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const seg of grid.get(`${cx + i},${cz + j}`) ?? []) {
        const rx = seg[2] - seg[0]; const rz = seg[3] - seg[1];
        const t = Math.max(0, Math.min(1, ((x - seg[0]) * rx + (z - seg[1]) * rz) / (rx * rx + rz * rz || 1)));
        const qx = seg[0] + rx * t; const qz = seg[1] + rz * t;
        const dist = Math.hypot(x - qx, z - qz);
        if (!best || dist < best.dist) best = { dist, x: qx, z: qz, w: seg[4] };
      }
    }
    return best;
  };
}

/** The longest-enough edge of a footprint that looks onto a road, with its outward normal. */
function streetEdge(ring, nearestRoad, minLength) {
  let best = null;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const dx = ring[j] - ring[i]; const dz = ring[j + 1] - ring[i + 1];
    const length = Math.hypot(dx, dz);
    if (length < minLength) continue;
    const mx = (ring[i] + ring[j]) / 2; const mz = (ring[i + 1] + ring[j + 1]) / 2;
    const road = nearestRoad(mx, mz);
    if (!road || road.dist > 26 || road.dist < 2.5) continue;
    if (best && road.dist >= best.roadDist) continue;
    const sign = ((road.x - mx) * -dz + (road.z - mz) * dx) > 0 ? 1 : -1;
    best = { ax: ring[i], az: ring[i + 1], mx, mz, length, tx: dx / length, tz: dz / length, nx: (-dz / length) * sign, nz: (dx / length) * sign, roadDist: road.dist, roadW: road.w };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {object} scene the district's scene JSON (roads, buildings)
 * @param {{ metro: object, collision: object, density?: number }} deps density 1 = full dressing;
 *   0.5 on phones and low-end machines halves the rooftop laundry and side-road festoons (build time and triangles)
 */
export function buildStreetClutter(scene, { metro, collision, density = 1 }) {
  const t0 = performance.now();
  const group = new THREE.Group(); group.name = 'street-clutter';
  group.userData.cinematicIgnore = true; // src/cinematic-clearance.js: dressing, not an obstacle
  const uniforms = { time: { value: 0 }, wind: { value: 1 } };
  const rnd = mulberry32(20260921);
  const corridor = metro?.centre?.length > 1 ? corridorOf(metro.centre) : null;
  const stations = metro?.stations ?? [];
  const nearStation = (x, z, r) => stations.some((s) => Math.hypot(s.x - x, s.z - z) < r);
  const blocked = (x, z, radius = 0.4) => {
    const [px, pz] = resolveCollision(collision, x, z, radius, 1);
    return Math.hypot(px - x, pz - z) > 0.15;
  };

  const decals = quadBatch();
  // Cloth is tiled: a map-wide merged mesh has a map-sized bounding sphere and
  // would be submitted whole, every frame, from anywhere.
  const clothTiles = new Map();
  const clothAt = (x, z) => {
    const key = `${Math.floor(x / CLOTH_TILE)},${Math.floor(z / CLOTH_TILE)}`;
    let batch = clothTiles.get(key);
    if (!batch) clothTiles.set(key, (batch = clothBatch()));
    return batch;
  };
  const posterUv = POSTERS.map((_, i) => rectUv(posterRect(i)));
  const chikaUv = CHIKA.map((_, i) => rectUv(chikaRect(i)));
  /** @type {{x:number,y:number,z:number,height:number,tiltX:number,tiltZ:number,yaw:number,radius:number,horizontal?:{tx:number,tz:number}}[]} */
  const poles = [];
  const pole = (x, z, y, height, radius = 0.045) => poles.push({ x, y, z, height, radius, tiltX: (rnd() - 0.5) * 0.05, tiltZ: (rnd() - 0.5) * 0.05, yaw: 0 });
  const ledger = (x, y, z, tx, tz, length, radius = 0.04) => poles.push({ x, y, z, height: length, radius, tiltX: 0, tiltZ: 0, yaw: 0, horizontal: { tx, tz } });

  // --- Pillars: posters in ranks, the way they are pasted, and wall writing ---
  for (const pier of metro?.piers ?? []) {
    const seed = hash(Math.round(pier.x * 7) ^ Math.round(pier.z * 13));
    for (const side of [-1, 1]) {
      const roll = (seed >>> (side > 0 ? 3 : 11)) % 10;
      if (roll < 2) continue; // some faces stay clean
      // Face normal points across the track; the shaft narrows towards the ground.
      const nx = pier.uz * side; const nz = -pier.ux * side;
      const faceAt = (y) => 0.78 + 0.0202 * y + 0.02;
      if (roll >= 7) {
        const y = 1.35 + rnd() * 0.5;
        const off = faceAt(y);
        decals.add(pier.x + nx * off, y, pier.z + nz * off, -pier.ux * side, -pier.uz * side, 0.56, 0.135, nx, nz, chikaUv[(seed >>> 5) % CHIKA.length], (rnd() - 0.5) * 0.04, 0.0202);
      }
      const kind = (seed >>> (side > 0 ? 7 : 17)) % POSTERS.length;
      const rows = 1 + ((seed >>> 9) % 3); const cols = 2;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        if (rnd() < 0.12) continue; // torn off
        const y = 2.3 + row * 0.8 + (roll >= 7 ? 0.2 : 0);
        const along = (col - 0.5) * 0.56 + (rnd() - 0.5) * 0.04;
        const off = faceAt(y);
        const which = rnd() < 0.75 ? kind : Math.floor(rnd() * POSTERS.length);
        decals.add(pier.x + nx * off + pier.ux * along, y, pier.z + nz * off + pier.uz * along, -pier.ux * side, -pier.uz * side, 0.27, 0.375, nx, nz, posterUv[which], (rnd() - 0.5) * 0.07, 0.0202);
      }
    }
    // A festoon run from the footpath to the pillar, every few spans, both sides.
    if (corridor && seed % 6 === 0) {
      const national = seed % 3 === 0;
      for (const side of [-1, 1]) {
        const nx = pier.uz * side; const nz = -pier.ux * side;
        const far = CARRIAGEWAY_HALF + 0.9;
        const ex = pier.x + nx * far; const ez = pier.z + nz * far;
        if (blocked(ex, ez)) continue;
        pole(ex, ez, 0, 6.6, 0.05);
        festoon(pier.x + nx * 0.95, 7.2, pier.z + nz * 0.95, ex, 6.4, ez, national ? NATIONAL : PENNANTS, seed);
      }
    }
  }

  /** One sagging string of pennants between two points. */
  function festoon(ax, ay, az, bx, by, bz, palette, seed) {
    const cloth = clothAt(ax, az);
    const span = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / span; const tz = (bz - az) / span;
    const sag = Math.min(0.9, span * 0.055);
    const steps = Math.max(6, Math.round(span / 0.62));
    let px = ax; let py = ay; let pz = az;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t; const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      cloth.line(px, py, pz, x, y, z);
      if (i < steps) cloth.pennant(x, y - 0.015, z, tx, tz, 0.19, 0.42, palette[(i + seed) % palette.length], (seed % 97) + i * 0.9);
      px = x; py = y; pz = z;
    }
  }

  // --- Side roads: clusters of festoon strings from kerb to kerb ---
  if (corridor) {
    for (const road of scene.roads) {
      if (road.rank < 1 || road.rank > 3 || !(road.w >= 4 && road.w <= 13) || road.pts.length < 2) continue;
      const mid = road.pts[road.pts.length >> 1];
      if (corridor.nearest(mid[0], mid[1]).dist > CORRIDOR_BAND) continue;
      const seed = hash(Math.round(road.pts[0][0] * 3) ^ Math.round(road.pts[0][1] * 5));
      if (seed % (density < 1 ? 9 : 5) !== 0) continue;
      let travelled = 0; let next = 14 + (seed % 40); let run = 0;
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1]; const b = road.pts[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-3) continue;
        const ux = (b[0] - a[0]) / len; const uz = (b[1] - a[1]) / len;
        while (next < travelled + len) {
          const t = (next - travelled) / len;
          const x = a[0] + (b[0] - a[0]) * t; const z = a[1] + (b[1] - a[1]) * t;
          const half = road.w / 2 + 0.7;
          const lx = x - uz * half; const lz = z + ux * half; const rx = x + uz * half; const rz = z - ux * half;
          if (corridor.nearest(x, z).dist > CARRIAGEWAY_HALF + 8 && !blocked(lx, lz) && !blocked(rx, rz)) {
            const high = 5.4 + rnd() * 0.9;
            pole(lx, lz, 0, high + 0.25); pole(rx, rz, 0, high + 0.25);
            festoon(lx, high, lz, rx, high - 0.2 + rnd() * 0.4, rz, (seed + run) % 5 === 0 ? NATIONAL : PENNANTS, seed + run);
          }
          run++;
          // Three or four strings close together, then a long gap: a lane that had a wedding.
          next += run % 4 === 0 ? 120 + (hash(seed + run) % 160) : 5.5;
        }
        travelled += len;
      }
    }
  }

  // --- Buildings: scaffolding + hoarding + piles, and laundry on the roofs ---
  const nearestRoad = roadIndex(scene.roads, 2);
  const nets = quadBatch();
  const hoardings = quadBatch();
  const sand = []; const bricks = [];
  const netUv = [0, 0, 1, 1];
  let scaffolds = 0; let laundryLines = 0;
  const scaffoldSites = [];
  for (const building of scene.buildings) {
    if (!building.p?.length || building.far) continue;
    const pick = hash(building.id | 0);
    const wantsScaffold = pick % 170 === 0 && building.h >= 11 && building.h <= 42;
    const wantsLaundry = !wantsScaffold && pick % (density < 1 ? 26 : 13) === 0 && building.h >= 7 && building.h <= 28;
    if (!wantsScaffold && !wantsLaundry) continue;
    if (corridor && corridor.nearest(building.p[0], building.p[1]).dist > CORRIDOR_BAND) continue;
    const clipped = getClippedFootprint(scene, building);
    if (clipped?.dropped) continue;
    const ring = clipped?.ring ?? building.p;
    const edge = streetEdge(ring, nearestRoad, wantsScaffold ? 8 : 5);
    if (!edge) continue;

    if (wantsLaundry) {
      // A line along the parapet, a metre in from the street edge.
      const length = Math.min(edge.length - 1.2, 3.5 + rnd() * 5);
      if (length < 2.4) continue;
      const start = (edge.length - length) * rnd();
      const inset = 0.9;
      const ax = edge.ax + edge.tx * start - edge.nx * inset; const az = edge.az + edge.tz * start - edge.nz * inset;
      const bx = ax + edge.tx * length; const bz = az + edge.tz * length;
      const top = building.h + 1.75;
      pole(ax, az, building.h, 1.9, 0.03); pole(bx, bz, building.h, 1.9, 0.03);
      const cloth = clothAt(ax, az);
      cloth.line(ax, top, az, bx, top, bz);
      let along = 0.35;
      while (along < length - 0.5) {
        const w = 0.28 + rnd() * 0.3; // half width
        const isSari = rnd() < 0.18;
        const h = isSari ? 1.5 : 0.55 + rnd() * 0.5;
        cloth.sheet(ax + edge.tx * (along + w), top - 0.02, az + edge.tz * (along + w), edge.tx, edge.tz, isSari ? 0.5 : w, h, CLOTHES[Math.floor(rnd() * CLOTHES.length)], rnd() * 40, isSari ? 0.3 : 0.16);
        along += (isSari ? 1.0 : w * 2) + 0.12 + rnd() * 0.3;
      }
      laundryLines++;
      continue;
    }

    // Scaffold: verticals every ~2 m, ledgers every lift, a second skin of
    // transoms back to the wall, all a little out of true like real bamboo.
    const length = Math.min(edge.length, 22);
    const height = Math.min(building.h, 30);
    const start = (edge.length - length) / 2;
    const out = 0.95;
    const ox = edge.ax + edge.tx * start + edge.nx * out; const oz = edge.az + edge.tz * start + edge.nz * out;
    if (blocked(ox + edge.tx * length / 2 + edge.nx, oz + edge.tz * length / 2 + edge.nz, 0.5)) continue;
    const bays = Math.max(3, Math.round(length / 2.1));
    for (let i = 0; i <= bays; i++) {
      const d = (i / bays) * length;
      pole(ox + edge.tx * d, oz + edge.tz * d, 0, height + 0.6 + rnd() * 0.9, 0.055);
    }
    const lifts = Math.floor(height / 2.05);
    for (let lift = 1; lift <= lifts; lift++) {
      const y = lift * 2.05 + (rnd() - 0.5) * 0.08;
      ledger(ox - edge.tx * 0.4, y, oz - edge.tz * 0.4, edge.tx, edge.tz, length + 0.8);
      for (let i = 0; i <= bays; i += 2) {
        const d = (i / bays) * length;
        ledger(ox + edge.tx * d - edge.nx * out, y - 0.06, oz + edge.tz * d - edge.nz * out, edge.nx, edge.nz, out + 0.35, 0.035);
      }
    }
    // Green debris net over the upper part.
    const netFrom = Math.min(height * 0.35, 6); const netH = height - netFrom;
    nets.add(ox + edge.tx * length / 2 + edge.nx * 0.08, netFrom + netH / 2, oz + edge.tz * length / 2 + edge.nz * 0.08, edge.tx, edge.tz, length / 2, netH / 2, edge.nx, edge.nz, netUv);
    // Tin hoarding at the foot, with the inevitable notices on it.
    const hx = edge.ax + edge.tx * start + edge.nx * 2.1; const hz = edge.az + edge.tz * start + edge.nz * 2.1;
    hoardings.add(hx + edge.tx * length / 2, 1.15, hz + edge.tz * length / 2, edge.tx, edge.tz, length / 2, 1.15, edge.nx, edge.nz, [0, 0, length / 1.1, 1]);
    const signAt = length * (0.25 + rnd() * 0.2);
    decals.add(hx + edge.tx * signAt + edge.nx * 0.03, 1.3, hz + edge.tz * signAt + edge.nz * 0.03, edge.nz, -edge.nx, 1.5, 0.35, edge.nx, edge.nz, chikaUv[pick % CHIKA.length], (rnd() - 0.5) * 0.03);
    for (let k = 0; k < 4; k++) {
      const at = length * (0.58 + k * 0.07);
      decals.add(hx + edge.tx * at + edge.nx * 0.03, 1.45 + (rnd() - 0.5) * 0.1, hz + edge.tz * at + edge.nz * 0.03, edge.nz, -edge.nx, 0.215, 0.298, edge.nx, edge.nz, posterUv[(pick + (k >> 1)) % POSTERS.length], (rnd() - 0.5) * 0.08);
    }
    // Building materials dumped on the street side of the hoarding.
    const px = hx + edge.nx * 1.3; const pz = hz + edge.nz * 1.3;
    const sandAt = length * 0.3; const brickAt = length * 0.68;
    if (!blocked(px + edge.tx * sandAt, pz + edge.tz * sandAt, 1)) sand.push({ x: px + edge.tx * sandAt, z: pz + edge.tz * sandAt, s: 0.8 + rnd() * 0.6, yaw: rnd() * 6.28, colour: rnd() < 0.5 ? 0xc9b48a : 0x9a9488 });
    if (!blocked(px + edge.tx * brickAt, pz + edge.tz * brickAt, 1)) bricks.push({ x: px + edge.tx * brickAt, z: pz + edge.tz * brickAt, s: 0.85 + rnd() * 0.4, yaw: Math.atan2(edge.tx, edge.tz) + (rnd() - 0.5) * 0.3 });
    scaffoldSites.push({ id: building.id, x: edge.mx, z: edge.mz, nx: edge.nx, nz: edge.nz, h: building.h, length });
    scaffolds++;
  }

  // --- Parked rickshaws: a stand either side of every station, nose to the kerb ---
  const parked = [];
  if (corridor) {
    for (const station of stations) {
      const centreD = corridor.nearest(station.x, station.z).d;
      for (const [along, side] of [[-128, 1], [112, -1], [-176, -1], [158, 1]]) {
        const count = 4 + Math.floor(rnd() * 5);
        for (let i = 0; i < count; i++) {
          const s = corridor.at(centreD + along + i * 1.55 * Math.sign(along));
          const lateral = (CARRIAGEWAY_HALF - 1.5 + (rnd() - 0.5) * 0.3) * side;
          const x = s.x + s.uz * lateral; const z = s.z - s.ux * lateral;
          if (blocked(x, z, 0.6)) continue;
          // Front is +Z; turned about 40 degrees in towards the footpath.
          parked.push({ x, z, yaw: Math.atan2(s.ux, s.uz) + side * -0.7 + (rnd() - 0.5) * 0.2, colour: Math.floor(rnd() * 6) });
        }
      }
    }
  }

  // --- Dogs: asleep against pillar bases and along the footpath ---
  const dogs = [];
  for (const pier of metro?.piers ?? []) {
    const seed = hash(Math.round(pier.x * 11) ^ Math.round(pier.z * 3));
    if (seed % 6 !== 0) continue;
    const side = seed % 2 ? 1 : -1;
    dogs.push({ x: pier.x + pier.ux * 2.1 * side + pier.uz * 0.5, z: pier.z + pier.uz * 2.1 * side - pier.ux * 0.5, yaw: (seed % 628) / 100, coat: seed % DOG_COATS.length, y: 0.2 });
  }
  if (corridor) {
    for (let d = 40; d < corridor.total; d += 95 + rnd() * 120) {
      const s = corridor.at(d); const side = rnd() < 0.5 ? -1 : 1;
      const lateral = (CARRIAGEWAY_HALF + 1.4) * side;
      const x = s.x + s.uz * lateral; const z = s.z - s.ux * lateral;
      if (blocked(x, z, 0.5) || nearStation(x, z, 40)) continue;
      dogs.push({ x, z, yaw: rnd() * 6.28, coat: Math.floor(rnd() * DOG_COATS.length), y: 0.12 });
    }
  }

  // --- Meshes -------------------------------------------------------------
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const instanced = []; // drawn out to RANGE
  const small = []; // drawn out to SMALL_RANGE
  const staticMesh = (mesh, name) => { mesh.name = name; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; group.add(mesh); return mesh; };

  if (decals.count) {
    staticMesh(new THREE.Mesh(decals.geometry(), new THREE.MeshLambertMaterial({ map: buildAtlasTexture(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), 'clutter-decals');
  }
  const clothMaterial = swayMaterial(uniforms);
  const clothMeshes = [];
  let clothTriangles = 0;
  for (const [key, batch] of clothTiles) {
    const mesh = new THREE.Mesh(batch.geometry(), clothMaterial);
    mesh.name = `clutter-cloth:${key}`; mesh.matrixAutoUpdate = false;
    mesh.geometry.computeBoundingSphere();
    clothTriangles += batch.triangles;
    group.add(mesh); clothMeshes.push(mesh);
  }
  if (nets.count) {
    staticMesh(new THREE.Mesh(nets.geometry(), new THREE.MeshLambertMaterial({ color: 0x1f7a3d, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })), 'clutter-nets');
  }
  if (hoardings.count) {
    staticMesh(new THREE.Mesh(hoardings.geometry(), new THREE.MeshLambertMaterial({ map: tinTexture(), side: THREE.DoubleSide })), 'clutter-hoardings');
  }

  if (poles.length) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true); // a prism: at 5-9 cm across nobody can count the sides
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), poles.length);
    const up = new THREE.Vector3(0, 1, 0); const dir = new THREE.Vector3();
    poles.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      if (p.horizontal) dummy.quaternion.setFromUnitVectors(up, dir.set(p.horizontal.tx, (rnd() - 0.5) * 0.03, p.horizontal.tz).normalize());
      else dummy.rotation.set(p.tiltX, 0, p.tiltZ);
      dummy.scale.set(p.radius, p.height, p.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.setHex(BAMBOO[i % BAMBOO.length]));
    });
    mesh.name = 'clutter-bamboo';
    group.add(mesh); small.push(mesh);
  }

  if (sand.length) {
    const geometry = new THREE.ConeGeometry(1.7, 0.95, 10, 2);
    geometry.translate(0, 0.475, 0);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { // slump it: a tipped load, not a traffic cone
      p.setY(i, p.getY(i) * (0.75 + 0.25 * Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3)));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), sand.length);
    sand.forEach((s, i) => {
      dummy.position.set(s.x, 0.02, s.z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(s.s, s.s * 0.9, s.s * 1.15); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, tint.setHex(s.colour));
    });
    mesh.name = 'clutter-sand'; group.add(mesh); instanced.push(mesh);
  }
  if (bricks.length) {
    // A stepped stack: three courses, each shorter than the one below.
    const parts = [[1.5, 0.32, 0.95, 0.16, 0], [1.2, 0.32, 0.95, 0.48, -0.1], [0.75, 0.3, 0.7, 0.79, -0.22]].map(([w, h, d, y, x]) => {
      const box = new THREE.BoxGeometry(w, h, d); box.translate(x, y, 0); return box;
    });
    const mesh = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0xa4452c }), bricks.length);
    bricks.forEach((b, i) => {
      dummy.position.set(b.x, 0.02, b.z); dummy.rotation.set(0, b.yaw, 0); dummy.scale.setScalar(b.s); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.name = 'clutter-bricks'; mesh.castShadow = true; group.add(mesh); instanced.push(mesh);
  }

  // Parked rickshaws are the one heavy model here (852 triangles), and a stand
  // of eight sits at every station. Same near/far split traffic.js uses for
  // the moving fleet: full model close up, its far model beyond RICKSHAW_NEAR.
  let packRickshaws = () => {};
  if (parked.length) {
    const model = vehicleGeometry('rickshaw');
    const hoods = [0xb4272c, 0x1c5fa8, 0x137a4a, 0x8b2f8f, 0xd18f16, 0x145f6e]; // traffic.js's RICKSHAW_COLORS
    const make = (geometry, name) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: model.doubleSide ? THREE.DoubleSide : THREE.FrontSide }), parked.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, tint.setHex(0xffffff)); // allocate instanceColor
      mesh.name = `clutter-parked-rickshaw:${name}`; mesh.frustumCulled = false; mesh.count = 0;
      group.add(mesh);
      return mesh;
    };
    const near = [model.paint, model.detail].filter(Boolean).map((geometry, i) => make(geometry, i ? 'detail' : 'paint'));
    const far = make(model.far, 'far');
    const matrices = parked.map((r) => {
      dummy.position.set(r.x, 0, r.z); dummy.rotation.set(0, r.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    const white = new THREE.Color(0xffffff);
    packRickshaws = (viewPos, range) => {
      let nearCount = 0; let farCount = 0;
      parked.forEach((r, i) => {
        const d = Math.hypot(r.x - viewPos.x, r.z - viewPos.z);
        if (d > range) return;
        tint.setHex(hoods[r.colour]);
        if (d < RICKSHAW_NEAR) {
          near.forEach((mesh, k) => { mesh.setMatrixAt(nearCount, matrices[i]); mesh.setColorAt(nearCount, k ? white : tint); });
          nearCount++;
        } else {
          far.setMatrixAt(farCount, matrices[i]); far.setColorAt(farCount, tint);
          farCount++;
        }
      });
      for (const mesh of near) mesh.count = nearCount;
      far.count = farCount;
      for (const mesh of [...near, far]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    };
  }

  if (dogs.length) {
    // Curled up nose-to-tail: a flattened body, the head tucked against the flank, ears, a tail wrapped round.
    // ~110 triangles: it is a shape on the ground seen from a moving rickshaw.
    const body = new THREE.SphereGeometry(0.34, 7, 4); body.scale(1.15, 0.5, 0.82);
    const haunch = new THREE.SphereGeometry(0.2, 5, 3); haunch.scale(1, 0.75, 1); haunch.translate(-0.24, 0.02, 0.12);
    const head = new THREE.SphereGeometry(0.13, 5, 3); head.scale(1.25, 0.8, 0.9); head.translate(0.27, -0.02, 0.22);
    const snout = new THREE.BoxGeometry(0.13, 0.07, 0.08); snout.translate(0.17, -0.06, 0.32);
    const earA = new THREE.ConeGeometry(0.04, 0.09, 4); earA.translate(0.33, 0.09, 0.17);
    const earB = new THREE.ConeGeometry(0.04, 0.09, 4); earB.translate(0.3, 0.09, 0.28);
    const tail = new THREE.TorusGeometry(0.27, 0.035, 3, 5, Math.PI * 0.8); tail.rotateX(Math.PI / 2); tail.rotateY(2.3); tail.translate(-0.12, -0.08, 0.06);
    const geometry = mergeGeometries([body, haunch, head, snout, earA, earB, tail].map((g) => g.toNonIndexed()));
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.clutterTime = uniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float clutterTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float breath = sin(clutterTime * 1.5 + instanceMatrix[3].x * 1.3 + instanceMatrix[3].z);
          transformed.y *= 1.0 + 0.055 * breath * step(0.0, transformed.y);`);
    };
    const mesh = new THREE.InstancedMesh(geometry, material, dogs.length);
    dogs.forEach((d, i) => {
      const size = 0.9 + ((i * 37) % 10) / 40;
      dummy.position.set(d.x, d.y + 0.15 * size, d.z); dummy.rotation.set(0, d.yaw, 0); dummy.scale.setScalar(size); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, tint.setHex(DOG_COATS[d.coat]));
    });
    mesh.name = 'clutter-dogs'; group.add(mesh); small.push(mesh);
  }

  for (const mesh of [...instanced, ...small]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  const culler = createInstanceCuller(instanced, RANGE);
  const smallCuller = createInstanceCuller(small, SMALL_RANGE);
  let detail = 1; // perf governor's distance scale, 0.5..1
  let quality = 1; // 1 = full, 0.6 = low tier (phones, machines the governor has given up on)
  let packedAt = null;

  function applyRanges() {
    culler.setRangeScale(detail * quality);
    smallCuller.setRangeScale(detail * quality);
    packedAt = null;
  }

  return {
    group,
    /** @param {{x: number, z: number}} viewPos @param {number} elapsed seconds */
    update(viewPos, elapsed) {
      uniforms.time.value = elapsed;
      culler.update(viewPos);
      smallCuller.update(viewPos);
      // Everything else here only changes when the viewer has actually gone somewhere.
      if (packedAt && Math.hypot(viewPos.x - packedAt.x, viewPos.z - packedAt.z) < 12) return;
      packedAt = { x: viewPos.x, z: viewPos.z };
      packRickshaws(viewPos, RANGE * detail * quality);
      for (const mesh of clothMeshes) {
        const sphere = mesh.geometry.boundingSphere;
        mesh.visible = Math.hypot(sphere.center.x - viewPos.x, sphere.center.z - viewPos.z) < sphere.radius + CLOTH_RANGE * detail * quality;
      }
    },
    /** 1 = a normal day's breeze; the monsoon turns it up. */
    setWind(strength) { uniforms.wind.value = strength; },
    /** @param {number} scale 0.5..1, from the perf governor's detail stage */
    setDetailScale(scale) { detail = scale; applyRanges(); },
    /** @param {'high' | 'low' | 'minimal'} tier low pulls every draw distance in to 60% */
    setQuality(tier) { quality = tier === 'high' ? 1 : 0.6; applyRanges(); },
    /** Where the scaffolds and stands ended up, for street-motion.js's tube lights. */
    sites: { sand, parked, scaffolds: scaffoldSites },
    stats: {
      posters: decals.count, clothTriangles, bamboo: poles.length, scaffolds, laundryLines,
      piles: sand.length + bricks.length, parked: parked.length, dogs: dogs.length,
      drawCalls: group.children.length, ms: Math.round(performance.now() - t0),
    },
  };
}
