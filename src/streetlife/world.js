/**
 * streetlife/world.js
 *
 * Turns the scene's real OpenStreetMap POIs into things to do on foot:
 *  - cha stalls at the mapped tea shops, plus procedural tong / fuchka /
 *    jhalmuri carts outside stations and named parks (street carts are not in
 *    OSM, so those are an approximation and are labelled generically);
 *  - eateries: every named restaurant, fast-food place, cafe and sweet shop
 *    that signs.js gave a real-name signboard, anchored at that signboard;
 *  - places: named parks, fields, ponds, markets, campuses and stations.
 *
 * Everything physical is two InstancedMeshes (stall body + tarp) plus a pool
 * of at most eight name-label sprites.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolveCollision, CARRIAGEWAY_HALF } from '../city.js';
import { LANDMARKS } from './landmarks.js';

const CELL = 60;
const MAX_MARKERS = 7;
const MARKER_RANGE = 90;
const LANDMARK_LABEL_RANGE = 320;

const STALL_KINDS = {
  cha: { label: 'Cha stall', tarps: [0xb4272c, 0x1c5fa8, 0x2f6b45] },
  fuchka: { label: 'Fuchka cart', tarps: [0xe0b020, 0xd98a1f] },
  jhalmuri: { label: 'Jhalmuri seller', tarps: [0xd9572b, 0xc23a5e] },
};

const EATERY_KINDS = new Set(['restaurant', 'fast_food', 'cafe']);
const EATERY_SHOPS = new Set(['confectionery', 'bakery', 'pastry', 'sweets']);
const PLACE_POI_KINDS = { marketplace: 'Market', university: 'Campus', college: 'Campus', library: 'Library' };
const AREA_LABELS = { park: 'Park', pitch: 'Field', water: 'Water', cemetery: 'Cemetery', wood: 'Green' };

/** Deterministic 0..1 hash so stall colours and placement survive reloads. */
function hash01(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function painted(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** A roadside tong: counter, four posts, customer bench, kettle and jars. Front is +Z. */
function stallBodyGeometry() {
  const parts = [];
  const counter = new THREE.BoxGeometry(1.9, 0.92, 0.85);
  counter.translate(0, 0.46, 0);
  parts.push(painted(counter, 0x6e4a2c));
  const top = new THREE.BoxGeometry(2.0, 0.05, 0.95);
  top.translate(0, 0.945, 0);
  parts.push(painted(top, 0x9a9a92));
  for (const [x, z] of [[-1.0, -0.62], [1.0, -0.62], [-1.0, 0.62], [1.0, 0.62]]) {
    const post = new THREE.BoxGeometry(0.06, 2.15, 0.06);
    post.translate(x, 1.075, z);
    parts.push(painted(post, 0x4a3a2a));
  }
  const bench = new THREE.BoxGeometry(1.7, 0.08, 0.32);
  bench.translate(0, 0.44, 1.35);
  parts.push(painted(bench, 0x7a5a38));
  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.BoxGeometry(0.08, 0.42, 0.28);
    leg.translate(x, 0.21, 1.35);
    parts.push(painted(leg, 0x4a3a2a));
  }
  const kettle = new THREE.CylinderGeometry(0.16, 0.19, 0.26, 10);
  kettle.translate(-0.55, 1.1, 0);
  parts.push(painted(kettle, 0xc9c9c4));
  for (const x of [0.1, 0.4, 0.7]) {
    const jar = new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8);
    jar.translate(x, 1.09, -0.12);
    parts.push(painted(jar, 0xd8c9a0));
  }
  return mergeGeometries(parts);
}

function stallTarpGeometry() {
  const tarp = new THREE.BoxGeometry(2.5, 0.05, 1.9);
  tarp.rotateX(0.16);
  tarp.translate(0, 2.2, 0.15);
  return tarp;
}

/**
 * @param {{ scene: object, roadGraph: object, collision: object, stations: Array<{ name: string, x: number, z: number }>,
 *   corridor: Array<[number, number] | { x: number, z: number }>, districtKey: string,
 *   signBays: Array<{ poi: object, x: number, z: number, nx: number, nz: number, y: number }> }} options
 */
export function buildStreetWorld({ scene, roadGraph, collision, stations, corridor, districtKey, signBays }) {
  const group = new THREE.Group();
  group.name = 'streetlife';

  // The rebuilt viaduct centreline (metro.centre), which streets.js and
  // traffic.js lay the corridor carriageways around — not the raw OSM tracks.
  const trackSegments = [];
  const centrePts = (corridor || []).map((p) => (Array.isArray(p) ? p : [p.x, p.z]));
  for (let i = 0; i < centrePts.length - 1; i++) trackSegments.push([centrePts[i], centrePts[i + 1]]);
  /** Closest point on the viaduct centreline, whose rebuilt carriageway is wider than the OSM road under it. */
  function corridorPoint(x, z) {
    const best = { x: 0, z: 0, d: Infinity };
    for (const [a, b] of trackSegments) {
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      const cx = a[0] + t * vx;
      const cz = a[1] + t * vz;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best.d) Object.assign(best, { x: cx, z: cz, d });
    }
    return best;
  }
  const distToCorridor = (x, z) => corridorPoint(x, z).d;

  /** Footpath point in front of a POI: its nearest road, stepped off the carriageway toward the POI. */
  function roadsidePoint(x, z, lateral = 0) {
    const snap = roadGraph.snapToRoad(x, z, 120, false);
    if (!snap) return null;
    let dx = x - snap.snapX;
    let dz = z - snap.snapZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return null;
    dx /= dist;
    dz /= dist;
    const halfRoad = (snap.width || (snap.rank >= 4 ? 12 : snap.rank === 3 ? 8 : 5)) / 2;
    let offset = halfRoad + 1.6;
    let px = snap.snapX + dx * offset - dz * lateral;
    let pz = snap.snapZ + dz * offset + dx * lateral;
    // Under the viaduct the clear carriageway is CARRIAGEWAY_HALF wide; step past it.
    for (let i = 0; i < 8 && distToCorridor(px, pz) < CARRIAGEWAY_HALF + 1.6; i++) {
      offset += 2;
      px = snap.snapX + dx * offset - dz * lateral;
      pz = snap.snapZ + dz * offset + dx * lateral;
    }
    [px, pz] = resolveCollision(collision, px, pz, 1.4, 1);
    // Facing the road: local +Z points from the stall back toward the carriageway.
    return { x: px, z: pz, yaw: Math.atan2(-dx, -dz), street: snap.roadName || null };
  }

  // --- Stalls --------------------------------------------------------------
  const stalls = [];
  function addStall(kind, name, x, z, lateral = 0) {
    const spot = roadsidePoint(x, z, lateral);
    if (!spot) return;
    if (stalls.some((s) => Math.hypot(s.x - spot.x, s.z - spot.z) < 9)) return;
    stalls.push({ type: 'stall', kind, name, key: `stall|${Math.round(spot.x)}|${Math.round(spot.z)}`, ...spot });
  }

  for (const poi of scene.pois || []) {
    if (poi.k === 'shop' && poi.sub === 'tea') addStall('cha', poi.name || 'Cha stall', poi.x, poi.z);
  }
  for (const station of stations) {
    // Carts gather outside every station entrance in real Dhaka; their exact spots are invented.
    addStall('cha', `${station.name} tong`, station.x + 22, station.z + 30, 0);
    addStall('fuchka', `${station.name} fuchka`, station.x - 24, station.z - 38, 3);
    addStall('jhalmuri', `${station.name} jhalmuri`, station.x + 26, station.z - 62, -3);
  }
  const namedAreas = [];
  for (const area of scene.areas || []) {
    if (!area.name || !AREA_LABELS[area.k] || area.k === 'wood') continue;
    let cx = 0;
    let cz = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const n = area.p.length / 2;
    for (let i = 0; i < n; i++) {
      const x = area.p[i * 2];
      const z = area.p[i * 2 + 1];
      cx += x;
      cz += z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    cx /= n;
    cz /= n;
    namedAreas.push({ area, x: cx, z: cz, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 });
  }
  for (const { area, x, z } of namedAreas) {
    if (area.k === 'park' || area.k === 'pitch') {
      addStall(hash01(x, z) < 0.5 ? 'fuchka' : 'jhalmuri', `${area.name} cart`, x, z);
    }
  }

  // --- Eateries ------------------------------------------------------------
  // Anchored to the signboard signs.js hung for that exact business, so the
  // name in the prompt is the name painted over the door you are standing at
  // (owner, 2026-09-20: real names "should match how it looks"). An eatery
  // that never got a sign — no frontage near its OSM point — is left out
  // rather than named in front of somebody else's shopfront.
  const eateries = [];
  for (const bay of signBays || []) {
    const poi = bay.poi;
    const isEatery = EATERY_KINDS.has(poi.k) || (poi.k === 'shop' && EATERY_SHOPS.has(poi.sub));
    const name = poi.name || poi.nameEn;
    if (!isEatery || !name) continue;
    eateries.push({
      type: 'eatery',
      kind: poi.k === 'shop' ? 'sweets' : poi.k,
      name,
      key: `food|${name}|${Math.round(poi.x)}|${Math.round(poi.z)}`,
      // Stand a stride out from the shutter, facing it.
      x: bay.x + bay.nx * 1.5,
      z: bay.z + bay.nz * 1.5,
      yaw: Math.atan2(bay.nx, bay.nz),
      labelX: bay.x + bay.nx * 0.35,
      labelZ: bay.z + bay.nz * 0.35,
      labelY: bay.y + 0.25,
      street: roadGraph.getStreetName(bay.x, bay.z, 40),
    });
  }

  // --- Places to discover --------------------------------------------------
  const places = [];
  for (const station of stations) {
    places.push({ key: `station|${station.name}`, name: `${station.name} station`, label: 'Metro', x: station.x, z: station.z, radius: 45 });
  }
  for (const { area, x, z, radius } of namedAreas) {
    places.push({ key: `area|${area.id}`, name: area.name, label: AREA_LABELS[area.k], x, z, radius: Math.max(30, Math.min(radius * 0.7, 110)) });
  }
  for (const poi of scene.pois || []) {
    const label = PLACE_POI_KINDS[poi.k];
    if (label && poi.name) {
      places.push({ key: `poi|${poi.name}|${Math.round(poi.x)}`, name: poi.name, label, x: poi.x, z: poi.z, radius: 32 });
    }
  }

  for (const mark of LANDMARKS[districtKey] || []) {
    places.unshift({ ...mark, key: `landmark|${mark.key}`, label: 'Landmark', landmark: true });
  }

  // --- Meshes --------------------------------------------------------------
  if (stalls.length) {
    const body = new THREE.InstancedMesh(stallBodyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), stalls.length);
    const tarp = new THREE.InstancedMesh(stallTarpGeometry(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), stalls.length);
    body.name = 'streetlife:stalls';
    tarp.name = 'streetlife:tarps';
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const segments = [];
    stalls.forEach((stall, i) => {
      dummy.position.set(stall.x, 0.16, stall.z);
      dummy.rotation.set(0, stall.yaw, 0);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      tarp.setMatrixAt(i, dummy.matrix);
      const tarps = STALL_KINDS[stall.kind].tarps;
      tarp.setColorAt(i, color.setHex(tarps[Math.floor(hash01(stall.x, stall.z) * tarps.length)]));

      // Counter footprint as four wall segments, low enough to fly over.
      const cos = Math.cos(stall.yaw);
      const sin = Math.sin(stall.yaw);
      const corner = (lx, lz) => [stall.x + lx * cos + lz * sin, stall.z - lx * sin + lz * cos];
      const c = [corner(-1, -0.5), corner(1, -0.5), corner(1, 0.5), corner(-1, 0.5)];
      for (let k = 0; k < 4; k++) {
        const a = c[k];
        const b = c[(k + 1) % 4];
        segments.push([a[0], a[1], b[0], b[1], 0, 2.4]);
      }
    });
    // Instances span the whole map, so per-mesh frustum culling would be wrong.
    body.frustumCulled = false;
    tarp.frustumCulled = false;
    body.castShadow = true;
    tarp.instanceColor.needsUpdate = true;
    group.add(body, tarp);
    collision.addSegments?.(segments);
  }

  // --- Spatial index -------------------------------------------------------
  const grid = new Map();
  for (const item of [...stalls, ...eateries]) {
    const key = `${Math.floor(item.x / CELL)},${Math.floor(item.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(item);
  }

  /** @returns {Array<object>} stalls and eateries within `radius` metres */
  function near(x, z, radius) {
    const out = [];
    const span = Math.ceil(radius / CELL);
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    for (let ix = gx - span; ix <= gx + span; ix++) {
      for (let iz = gz - span; iz <= gz + span; iz++) {
        const list = grid.get(`${ix},${iz}`);
        if (!list) continue;
        for (const item of list) {
          const d = Math.hypot(item.x - x, item.z - z);
          if (d <= radius) out.push({ item, d });
        }
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  // --- Name labels ---------------------------------------------------------
  // A small pool of text sprites over what is nearby and still new. Abstract
  // floating shapes read as rendering glitches (owner, 2026-09-20: "looks
  // broken these!"), so every marker says what it is.
  const LABEL_TINT = { cha: '#f2c14e', fuchka: '#f2c14e', jhalmuri: '#f2c14e', eatery: '#ff9a6b', errand: '#7ee0a8', landmark: '#ffffff' };
  const LABEL_KIND = { cha: 'cha', fuchka: 'fuchka', jhalmuri: 'jhalmuri', eatery: 'food', errand: 'deliver here', landmark: 'landmark' };
  const labels = [];
  for (let i = 0; i <= MAX_MARKERS; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
    sprite.center.set(0.5, 0);
    // Sprite.raycast needs raycaster.camera, which the game's own raycasts
    // (cinematic clearance, car sensors) never set; labels are not pickable.
    sprite.raycast = () => {};
    sprite.visible = false;
    sprite.renderOrder = 5;
    group.add(sprite);
    labels.push({ sprite, canvas, texture, key: null, x: 0, z: 0, y: 0, aspect: 1, range: MARKER_RANGE });
  }

  function paintLabel(label, name, kind) {
    const ctx = label.canvas.getContext('2d');
    const H = label.canvas.height;
    ctx.clearRect(0, 0, label.canvas.width, H);
    ctx.font = '600 38px "Noto Sans Bengali", Arial, sans-serif';
    const tag = LABEL_KIND[kind].toUpperCase();
    const text = name.length > 42 ? `${name.slice(0, 41)}…` : name;
    const nameW = ctx.measureText(text).width;
    ctx.font = '700 22px Arial, sans-serif';
    const tagW = ctx.measureText(tag).width;
    const W = Math.min(label.canvas.width, Math.ceil(nameW + tagW + 78));
    ctx.fillStyle = 'rgba(13,19,18,0.88)';
    ctx.fillRect(0, 8, W, H - 16);
    ctx.fillStyle = LABEL_TINT[kind];
    ctx.fillRect(0, 8, 8, H - 16);
    ctx.textBaseline = 'middle';
    ctx.font = '600 38px "Noto Sans Bengali", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 26, H / 2 + 2);
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillStyle = LABEL_TINT[kind];
    ctx.fillText(tag, 26 + nameW + 22, H / 2 + 3);
    // Show only the painted part of the canvas so the pill hugs its text.
    label.texture.repeat.set(W / label.canvas.width, 1);
    label.texture.needsUpdate = true;
    label.aspect = W / H;
  }

  /** Reassign the label pool; cheap enough to run a couple of times a second. */
  function refreshLabels(x, z, isNew, errand, isDiscovered) {
    const wanted = [];
    if (errand) wanted.push({ key: `errand|${errand.name}`, name: errand.name, kind: 'errand', x: errand.x, z: errand.z, y: 3.4 });
    // Undiscovered landmarks announce themselves from further off than shops do.
    for (const place of places) {
      if (!place.landmark || isDiscovered(place) || Math.hypot(place.x - x, place.z - z) > LANDMARK_LABEL_RANGE) continue;
      wanted.push({ key: place.key, name: place.name, kind: 'landmark', x: place.x, z: place.z, y: 9, range: LANDMARK_LABEL_RANGE });
    }
    for (const { item } of near(x, z, MARKER_RANGE)) {
      if (wanted.length > MAX_MARKERS) break;
      if (!isNew(item)) continue;
      const kind = item.type === 'stall' ? item.kind : 'eatery';
      // Eatery labels sit just above their own signboard; stalls above the tarp.
      wanted.push(item.type === 'stall'
        ? { key: item.key, name: item.name, kind, x: item.x, z: item.z, y: 2.75 }
        : { key: item.key, name: item.name, kind, x: item.labelX, z: item.labelZ, y: item.labelY });
    }
    labels.forEach((label, i) => {
      const want = wanted[i];
      label.sprite.visible = !!want;
      if (!want) {
        label.key = null;
        return;
      }
      if (label.key !== want.key) {
        label.key = want.key;
        paintLabel(label, want.name, want.kind);
      }
      // Errands and landmarks are worth seeing through walls; shop labels are not.
      label.sprite.material.depthTest = want.kind !== 'errand' && want.kind !== 'landmark';
      Object.assign(label, { x: want.x, z: want.z, y: want.y, range: want.range || MARKER_RANGE });
    });
  }

  function hideLabels() {
    for (const label of labels) label.sprite.visible = false;
  }

  /** Per frame: keep labels a steady on-screen size, and out of the way up close. */
  function updateLabels(camX, camZ) {
    for (const label of labels) {
      if (!label.sprite.visible) continue;
      const d = Math.hypot(label.x - camX, label.z - camZ);
      const far = label.range > MARKER_RANGE; // landmarks: larger, and legible from across the junction
      const height = Math.max(0.36, Math.min(far ? 16 : 2.6, d * (far ? 0.055 : 0.034)));
      label.sprite.position.set(label.x, label.y, label.z);
      label.sprite.scale.set(height * label.aspect, height, 1);
      label.sprite.material.opacity = Math.max(0, Math.min(1, (d - 2.2) / 2.5)) * Math.max(0.35, Math.min(1, (label.range - d) / 30));
    }
  }

  return {
    group,
    stalls,
    eateries,
    places,
    near,
    roadsidePoint,
    corridorPoint,
    refreshLabels,
    updateLabels,
    hideLabels,
    stallLabel: (kind) => STALL_KINDS[kind].label,
  };
}
