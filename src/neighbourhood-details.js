import * as THREE from 'three';
import { getClippedFootprint } from './city.js';

/** @typedef {{ id: number, h: number, lv: number, p: number[] }} Building */
/** @typedef {{ x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, color: number }} Detail */
const regions = [
  { name: 'pallabi', minX: -380, maxX: -170, minZ: -1820, maxZ: -1100 },
  // Mirpur DOHS is a planned, numbered-road enclave around the mapped
  // Central Mosque and pond. Keep the treatment light and instanced so the
  // dense grid reads as finished apartments without adding draw calls.
  { name: 'mirpur-dohs', minX: -120, maxX: 430, minZ: -2850, maxZ: -2200 },
  // Uttara South has wider setbacks, cleaner apartment blocks, and visible
  // reservoir edges north/east of the station. OSM still owns every footprint.
  { name: 'uttara-south', minX: -850, maxX: 150, minZ: -4300, maxZ: -3000 },
];

/** Street-reference proportions; exact plot outlines remain sourced from OSM. */
export function buildNeighbourhoodDetails(scene) {
  const group = new THREE.Group(); group.name = 'neighbourhood-details';
  const tiles = new Map();
  const roadSegments = scene.roads.filter((road) => road.rank >= 3).flatMap((road) => road.pts.slice(1).map((point, i) => [road.pts[i][0], road.pts[i][1], point[0], point[1]]));
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = [
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    new THREE.MeshLambertMaterial({ color: 0x515956 }),
    new THREE.MeshLambertMaterial({ color: 0xd2d0c1 }),
    new THREE.MeshLambertMaterial({ color: 0x5f675e }),
  ];
  let buildings = 0;
  for (const building of scene.buildings) {
    if (building.h < 8 || building.h > 45) continue;
    const clipped = getClippedFootprint(scene, building);
    if (clipped?.dropped) continue;
    const ring = clipped?.ring ?? building.p;
    if (!ring?.length) continue;
    const x = ring.filter((_, i) => !(i % 2)).reduce((a, b) => a + b, 0) / (ring.length / 2);
    const z = ring.filter((_, i) => i % 2).reduce((a, b) => a + b, 0) / (ring.length / 2);
    if (!regions.some((region) => x > region.minX && x < region.maxX && z > region.minZ && z < region.maxZ)) continue;
    if ([428135535, 352027195, 352027475].includes(building.id)) continue;
    let best = null;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const dx = ring[j] - ring[i]; const dz = ring[j + 1] - ring[i + 1];
      const length = Math.hypot(dx, dz);
      if (length < 6) continue;
      const mx = (ring[i] + ring[j]) / 2; const mz = (ring[i + 1] + ring[j + 1]) / 2;
      let distance = Infinity; let roadX = 0; let roadZ = 0;
      for (const [ax, az, bx, bz] of roadSegments) {
        if (mx < Math.min(ax, bx) - 25 || mx > Math.max(ax, bx) + 25 || mz < Math.min(az, bz) - 25 || mz > Math.max(az, bz) + 25) continue;
        const rx = bx - ax; const rz = bz - az;
        const t = Math.max(0, Math.min(1, ((mx - ax) * rx + (mz - az) * rz) / (rx * rx + rz * rz || 1)));
        const qx = ax + t * rx; const qz = az + t * rz;
        const d = Math.hypot(mx - qx, mz - qz);
        if (d < distance) { distance = d; roadX = qx; roadZ = qz; }
      }
      if (distance > 24 || distance < 3) continue;
      if (!best || distance < best.distance) {
        const sign = ((roadX - mx) * -dz + (roadZ - mz) * dx) > 0 ? 1 : -1;
        best = { mx, mz, length, tx: dx / length, tz: dz / length, nx: -dz / length * sign, nz: dx / length * sign, distance, yaw: -Math.atan2(dz, dx) };
      }
    }
    if (!best) continue;
    buildings++;
    const key = `${Math.floor(x / 180)},${Math.floor(z / 180)}`;
    if (!tiles.has(key)) tiles.set(key, { x: Math.floor(x / 180) * 180 + 90, z: Math.floor(z / 180) * 180 + 90, buckets: [[], [], [], []], meshes: [] });
    const tile = tiles.get(key);
    const palette = [0xdedace, 0xc0c7bd, 0xd6b8ad, 0xbccbd0, 0xddd4b4];
    const color = palette[building.id % palette.length];
    const floors = Math.max(2, Math.min(11, building.lv || Math.round(building.h / 3.1)));
    const spacing = building.h / floors;
    const bays = Math.max(1, Math.floor(best.length / 3.6));
    /** @param {number} bucket @param {number} along @param {number} y @param {number} depth @param {number} w @param {number} h @param {number} d @param {number} tint */
    function add(bucket, along, y, depth, w, h, d, tint = color) {
      tile.buckets[bucket].push({ x: best.mx + best.tx * along + best.nx * depth, y, z: best.mz + best.tz * along + best.nz * depth, w, h, d, yaw: best.yaw, color: tint });
    }
    // Dhaka's side streets read through their low, projecting shop awnings
    // and narrow painted pilasters even when the upper floors are distant.
    // Keep these as one extra instanced bucket per tile so the close-up gain
    // costs a single draw per streamed tile, not one mesh per frontage.
    add(3, 0, Math.min(3.2, spacing * 0.82), 0.5, best.length, 0.12, 0.88, 0x5f675e);
    for (let bay = 0; bay < bays; bay += 2) {
      const along = (bay - (bays - 1) / 2) * (best.length / bays);
      add(3, along, 1.45, 0.18, 0.12, 2.7, 0.12, 0x313b3a);
    }
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * spacing;
      add(0, 0, y, .15, best.length, .16, .38);
      for (let bay = 0; bay < bays; bay++) {
        const along = (bay - (bays - 1) / 2) * (best.length / bays);
        const balcony = (building.id + bay) % 3 !== 0;
        if (balcony) {
          add(0, along, y + .12, .32, Math.min(2.5, best.length / bays - .35), .2, .68);
          add(1, along, y + 1.05, .61, 2.3, .045, .05, 0x515956);
          add(1, along, y + .5, .61, 2.3, .035, .05, 0x515956);
          for (const rail of [-1, 0, 1]) add(1, along + rail, y + .68, .61, .035, .76, .035, 0x515956);
        } else if (floor % 2) add(2, along, y + 1.1, .27, .72, .5, .5, 0xc7c7bb);
      }
    }
    add(0, 0, building.h + .35, 0, best.length, .7, .18);
  }
  const dummy = new THREE.Object3D(); const color = new THREE.Color();
  for (const tile of tiles.values()) {
    tile.buckets.forEach((details, index) => {
      if (!details.length) return;
      const mesh = new THREE.InstancedMesh(geometry, materials[index], details.length);
      mesh.name = `neighbourhood-${index}`;
      details.forEach((detail, i) => {
        dummy.position.set(detail.x, detail.y, detail.z); dummy.rotation.set(0, detail.yaw, 0); dummy.scale.set(detail.w, detail.h, detail.d); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.setHex(detail.color));
      });
      mesh.computeBoundingSphere(); group.add(mesh); tile.meshes.push(mesh);
    });
    delete tile.buckets;
  }
  function update(x, z) {
    for (const tile of tiles.values()) {
      const visible = Math.hypot(x - tile.x, z - tile.z) < 310;
      for (const mesh of tile.meshes) mesh.visible = visible;
    }
  }
  return { group, update, stats: { buildings, tiles: tiles.size } };
}
