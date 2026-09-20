/**
 * stadium.js
 *
 * The Sher-e-Bangla National Cricket Stadium at Mirpur — the home of
 * Bangladesh cricket, and the largest single structure in this scene after
 * the metro itself. Hand-modelled, like sangsad.js and landmarks.js.
 *
 * PLAN — surveyed. OpenStreetMap way 121390579 (`leisure=stadium`,
 * `wikidata=Q16135053`), 49 nodes, converted to scene metres: centre
 * (-329.8, 761.1), radius 88.9–130.8 m. It is a squashed oval, so the ring
 * is resampled from the real outline rather than drawn as a circle.
 *
 * ELEVATION — from Wikimedia Commons imagery, written up in
 * reference/stadium/OBSERVATIONS.md: a LOW single-tier bowl of GREEN seats
 * (city rooftops show over the roofline all the way round), a pale canopy
 * over the back of the stand with a RED fascia band along its leading edge,
 * a taller pavilion block on one side, slim floodlight masts with wide lamp
 * heads, and a green outfield with the tan pitch square.
 *
 * Until now OSM building 6385797 — this same ring — was extruded by city.js
 * as one flat 19.4 m block. main.js now excludes it.
 *
 * Cost: two draw calls. Everything structural is one vertex-coloured merged
 * mesh; the lamp heads are a second, unlit mesh so they can glow at night.
 * No lights are added — a light recompiles every material in the world (see
 * drive.js's prewarmDriving).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** OSM way 121390579, scene metres (+X east, +Z south). */
const RING = [
  [-434.3, 712.9], [-435.4, 727.1], [-431.6, 726.5], [-431.6, 739], [-429.4, 752.5],
  [-423.6, 770.4], [-413.7, 793], [-407.3, 804.7], [-398.2, 821.3], [-386.1, 837.2],
  [-373, 850.6], [-367.1, 854.4], [-369.3, 858.2], [-363.4, 862], [-365.1, 864.5],
  [-353.2, 870.5], [-339.5, 874.6], [-328, 877.3], [-308.2, 877.9], [-295, 876.5],
  [-279, 872], [-267, 866.4], [-256.6, 861.1], [-246.9, 853.8], [-231.2, 836.4],
  [-220.4, 817.1], [-214.7, 799.9], [-211.6, 780.1], [-214.3, 779.5], [-214.5, 766],
  [-218.5, 747.5], [-226.2, 728.2], [-239.6, 702.8], [-251, 680.6], [-257.8, 670.8],
  [-265.7, 661.8], [-275.4, 653], [-286.5, 644.9], [-296, 639.4], [-305.7, 635.9],
  [-332.1, 631.4], [-346.6, 631.7], [-367.4, 635.9], [-389.1, 647.6], [-400.1, 655.1],
  [-411.2, 665.6], [-417.1, 672.6], [-429.7, 694.9], [-434.3, 712.9],
];

/** OSM building id for the same ring — city.js must not extrude it as a block. */
export const STADIUM_BUILDING_IDS = [6385797];

const SEGMENTS = 72;

// Radial fractions of the surveyed outline, from the field outward.
const R_FIELD = 0.54;   // outfield edge
const R_SEAT0 = 0.60;   // front row
const R_SEAT1 = 0.83;   // back row
const R_ROOF = 1.0;     // outer wall / roof edge

const Y_FIELD = 0.25;
const Y_SEAT0 = 2.2;    // front row, above the boundary
const Y_SEAT1 = 13.5;   // back row
const Y_ROOF = 17.5;    // canopy
const WALL_TOP = 14.0;  // outer concrete wall

const C_CONCRETE = 0xb9b7ae;
const C_SEAT = 0x3f8a4a;     // green seating
const C_ROOF = 0xd6d8d4;
const C_FASCIA = 0xb3352c;   // red fascia band along the canopy edge
const C_GRASS = 0x5c8f3f;
const C_PITCH = 0xc2b183;
const C_MAST = 0x9aa0a2;

/** Colour a geometry's vertices so the whole stadium can share one material. */
function painted(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  // mergeGeometries() requires identical attribute sets. The hand-built bands
  // below carry only position/normal, so drop everything the primitives add.
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

/**
 * Resample the surveyed outline to SEGMENTS evenly spaced bearings, so every
 * concentric ring below follows the real oval instead of a circle.
 */
function resampleRing() {
  let cx = 0;
  let cz = 0;
  const pts = RING.slice(0, -1); // drop the repeated closing node
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length;
  cz /= pts.length;

  const polar = pts
    .map((p) => ({ a: Math.atan2(p[1] - cz, p[0] - cx), r: Math.hypot(p[0] - cx, p[1] - cz) }))
    .sort((p, q) => p.a - q.a);

  const out = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = -Math.PI + (i / SEGMENTS) * Math.PI * 2;
    // Radius interpolated between the two surveyed bearings either side.
    let lo = polar[polar.length - 1];
    let hi = polar[0];
    for (let k = 0; k < polar.length; k++) {
      if (polar[k].a <= a) { lo = polar[k]; hi = polar[(k + 1) % polar.length]; }
    }
    let span = hi.a - lo.a;
    if (span <= 0) span += Math.PI * 2;
    let t = span > 1e-6 ? (a - lo.a) / span : 0;
    if (t < 0) t += (Math.PI * 2) / span;
    t = Math.max(0, Math.min(1, t));
    const r = lo.r + (hi.r - lo.r) * t;
    out.push({ a, r, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return { centre: { x: cx, z: cz }, ring: out };
}

/** A closed band between two concentric rings, at two heights. */
function band(ring, centre, r0, y0, r1, y1) {
  const pos = [];
  const at = (i, rf, y) => {
    const p = ring[i % ring.length];
    return [centre.x + (p.x - centre.x) * rf, y, centre.z + (p.z - centre.z) * rf];
  };
  for (let i = 0; i < ring.length; i++) {
    const a0 = at(i, r0, y0);
    const b0 = at(i + 1, r0, y0);
    const a1 = at(i, r1, y1);
    const b1 = at(i + 1, r1, y1);
    pos.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A filled disc following the outline at radius fraction rf. */
function disc(ring, centre, rf, y) {
  const pos = [];
  const at = (i) => {
    const p = ring[i % ring.length];
    return [centre.x + (p.x - centre.x) * rf, y, centre.z + (p.z - centre.z) * rf];
  };
  for (let i = 0; i < ring.length; i++) {
    pos.push(centre.x, y, centre.z, ...at(i + 1), ...at(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * @param {{ walkable?: object, collision?: object }} deps
 */
export function buildStadium({ walkable, collision } = {}) {
  const { centre, ring } = resampleRing();
  const group = new THREE.Group();
  group.name = 'stadium';

  const parts = [];

  // Outfield, then the tan pitch square at the middle.
  parts.push(painted(disc(ring, centre, R_FIELD, Y_FIELD), C_GRASS));
  const pitch = new THREE.BoxGeometry(24, 0.12, 4.2);
  pitch.translate(centre.x, Y_FIELD + 0.06, centre.z);
  parts.push(painted(pitch, C_PITCH));

  // Seating bowl: stepped tiers from the front row up to the back row, so it
  // reads as rows rather than one smooth cone.
  const TIERS = 7;
  for (let t = 0; t < TIERS; t++) {
    const f0 = t / TIERS;
    const f1 = (t + 1) / TIERS;
    const r0 = R_SEAT0 + (R_SEAT1 - R_SEAT0) * f0;
    const r1 = R_SEAT0 + (R_SEAT1 - R_SEAT0) * f1;
    const y0 = Y_SEAT0 + (Y_SEAT1 - Y_SEAT0) * f0;
    const y1 = Y_SEAT0 + (Y_SEAT1 - Y_SEAT0) * f1;
    parts.push(painted(band(ring, centre, r0, y0, r0, y1), C_SEAT)); // riser
    parts.push(painted(band(ring, centre, r0, y1, r1, y1), C_SEAT)); // tread
  }
  // Boundary wall in front of the first row.
  parts.push(painted(band(ring, centre, R_FIELD, Y_FIELD, R_SEAT0, Y_SEAT0), C_CONCRETE));

  // Outer concrete wall, and the canopy over the back of the stand with its
  // red leading edge.
  parts.push(painted(band(ring, centre, R_ROOF, 0, R_ROOF, WALL_TOP), C_CONCRETE));
  parts.push(painted(band(ring, centre, R_SEAT1, Y_SEAT1, R_ROOF, WALL_TOP), C_CONCRETE));
  parts.push(painted(band(ring, centre, R_SEAT1 - 0.02, Y_ROOF, R_ROOF, Y_ROOF + 1.2), C_ROOF));
  parts.push(painted(band(ring, centre, R_SEAT1 - 0.02, Y_ROOF - 0.9, R_SEAT1 - 0.02, Y_ROOF), C_FASCIA));
  // Columns carrying the canopy, every sixth bay.
  for (let i = 0; i < ring.length; i += 6) {
    const p = ring[i];
    const rf = R_ROOF - 0.03;
    const x = centre.x + (p.x - centre.x) * rf;
    const z = centre.z + (p.z - centre.z) * rf;
    const col = new THREE.BoxGeometry(0.5, Y_ROOF - WALL_TOP + 1.2, 0.5);
    col.translate(x, WALL_TOP + (Y_ROOF - WALL_TOP) / 2, z);
    parts.push(painted(col, C_CONCRETE));
  }

  // Pavilion / media block. Placed on the WEST side of the ring, the deeper
  // side of the bowl; its exact position on the ring is estimated.
  const pav = ring[Math.round(ring.length * 0.5)];
  const pavYaw = Math.atan2(pav.x - centre.x, pav.z - centre.z);
  const pavBox = new THREE.BoxGeometry(46, 9, 13);
  pavBox.rotateY(pavYaw);
  pavBox.translate(
    centre.x + (pav.x - centre.x) * 0.9,
    WALL_TOP - 1 + 4.5,
    centre.z + (pav.z - centre.z) * 0.9
  );
  parts.push(painted(pavBox, 0xd9d6cc));

  // Floodlights. COUNT IS UNVERIFIED — six evenly spaced is a reasonable
  // cricket-ground arrangement, not a measured fact (see the reference doc).
  const MASTS = 6;
  const lamps = [];
  for (let m = 0; m < MASTS; m++) {
    const p = ring[Math.round((m / MASTS) * ring.length) % ring.length];
    const rf = R_ROOF + 0.03;
    const x = centre.x + (p.x - centre.x) * rf;
    const z = centre.z + (p.z - centre.z) * rf;
    const yaw = Math.atan2(centre.x - x, centre.z - z);
    const mast = new THREE.CylinderGeometry(0.55, 0.95, 42, 8);
    mast.translate(x, 21, z);
    parts.push(painted(mast, C_MAST));
    const head = new THREE.BoxGeometry(11, 5.5, 1.1);
    head.rotateY(yaw);
    head.translate(x, 44.5, z);
    const flat = head.index ? head.toNonIndexed() : head;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
    }
    lamps.push(flat);
  }

  const shell = new THREE.Mesh(
    mergeGeometries(parts),
    // DoubleSide: the concentric bands below are built by walking the ring in
    // one direction, so the seat risers and the canopy wind away from the
    // field and were invisible from inside the bowl.
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );
  shell.name = 'stadium:shell';
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  // Lamp heads unlit, so they read as lamps by day and can glow at night.
  const lampMesh = new THREE.Mesh(
    mergeGeometries(lamps),
    new THREE.MeshBasicMaterial({ color: 0xf2f1e4 })
  );
  lampMesh.name = 'stadium:floodlights';
  group.add(lampMesh);

  // The outfield is walkable if you get in; the outer wall is solid.
  const walls = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    walls.push([a.x, a.z, b.x, b.z, 0, WALL_TOP]);
  }
  collision?.addSegments?.(walls);
  walkable?.slab(Y_FIELD, centre.x, centre.z, 60, 60, 0);

  let triangles = 0;
  group.traverse((o) => {
    if (o.geometry) triangles += o.geometry.attributes.position.count / 3;
  });

  return {
    group,
    centre,
    stats: { drawCalls: group.children.length, triangles: Math.round(triangles) },
  };
}
