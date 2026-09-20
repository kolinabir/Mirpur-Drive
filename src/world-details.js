import * as THREE from 'three';

/**
 * Small, readable street landmarks for the north district. OSM still owns
 * the large building and water footprints; these are lightweight frontage
 * pieces placed from nearby road geometry so the player can recognise the
 * neighbourhood at street level.
 */

const DEFINITIONS = [
  { type: 'bus', names: ['Pallabi Bus Station'], fallback: [-274.48, -1627.58], en: 'Pallabi Bus Station', bn: 'পল্লবী বাস স্ট্যান্ড' },
  { type: 'market', names: ['Rangdhonu shopping complex'], fallback: [-228.99, -1163.81], en: 'Rangdhonu Shopping Complex', bn: 'রংধনু শপিং কমপ্লেক্স' },
  { type: 'school', names: ['Mother Teresa Catholic School'], fallback: [-344.48, -1211.14], en: 'Mother Teresa Catholic School', bn: 'মাদার তেরেসা স্কুল' },
  { type: 'school', names: ['South Point School', 'সাউথ পয়েন্ট স্কুল'], fallback: [-243, -1611], en: 'South Point School & College', bn: 'সাউথ পয়েন্ট স্কুল অ্যান্ড কলেজ' },
  { type: 'mosque', names: ['Mirpur DOHS Central Mosque'], fallback: [66.85, -2514.11], en: 'Mirpur DOHS Central Mosque', bn: 'মিরপুর ডিওএইচএস সেন্ট্রাল মসজিদ' },
  { type: 'market', names: ['Mirpur DOHS Shopping Complex'], fallback: [24, -2390], en: 'Mirpur DOHS Shopping Complex', bn: 'মিরপুর ডিওএইচএস শপিং কমপ্লেক্স' },
  { type: 'lake', names: [], fallback: [312, -2564], en: 'Mirpur DOHS Pond', bn: 'মিরপুর ডিওএইচএস লেক' },
  { type: 'gateway', names: [], fallback: [-370, -3340], en: 'Uttara South', bn: 'উত্তরা দক্ষিণ' },
  { type: 'lake', names: [], fallback: [-500, -2774], en: 'Uttara Reservoir', bn: 'উত্তরা জলাধার' },
];

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
const domeGeometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const coneGeometry = new THREE.ConeGeometry(1, 1, 12);
const materials = new Map();

function material(color, roughness = 0.85) {
  const key = `${color}:${roughness}`;
  let value = materials.get(key);
  if (!value) {
    // Lambert keeps the added street pieces cheap; do not pass Standard-only
    // roughness props here because Three.js logs a warning for Lambert mats.
    value = new THREE.MeshLambertMaterial({ color });
    materials.set(key, value);
  }
  return value;
}

function namedPoi(scene, names, fallback) {
  const wanted = names.map((name) => name.toLowerCase());
  const poi = (scene.pois || []).find((entry) => {
    const label = `${entry.name || ''} ${entry.nameEn || ''}`.toLowerCase();
    return wanted.some((name) => label.includes(name));
  });
  return { x: poi?.x ?? fallback[0], z: poi?.z ?? fallback[1], source: poi ? 'osm-poi' : 'street-reference' };
}

function nearestRoadPose(scene, x, z) {
  let best = null;
  for (const road of scene.roads || []) {
    if (road.rank < 1 || !road.pts || road.pts.length < 2) continue;
    for (let i = 1; i < road.pts.length; i++) {
      const ax = road.pts[i - 1][0]; const az = road.pts[i - 1][1];
      const bx = road.pts[i][0]; const bz = road.pts[i][1];
      const dx = bx - ax; const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const qx = ax + dx * t; const qz = az + dz * t;
      const distance = Math.hypot(x - qx, z - qz);
      if (!best || distance < best.distance) {
        const len = Math.sqrt(len2);
        const tx = dx / len; const tz = dz / len;
        const leftX = -tz; const leftZ = tx;
        const side = (x - qx) * leftX + (z - qz) * leftZ >= 0 ? 1 : -1;
        const nx = leftX * side; const nz = leftZ * side;
        const width = Math.max(4, road.w || 6);
        best = {
          distance,
          x: qx + nx * (width / 2 + 2.2),
          z: qz + nz * (width / 2 + 2.2),
          nx,
          nz,
          tx,
          tz,
          yaw: Math.atan2(-tz, tx),
        };
      }
    }
  }
  return best || { x, z, nx: 0, nz: 1, tx: 1, tz: 0, yaw: 0, distance: Infinity };
}

function makeSign(en, bn, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 176;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17251f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 18, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff9e9';
  ctx.font = '700 42px "Noto Sans Bengali", "Nirmala UI", system-ui, sans-serif';
  ctx.fillText(bn, canvas.width / 2, 66);
  ctx.font = '600 23px system-ui, Arial, sans-serif';
  ctx.fillStyle = '#d6e4d4';
  ctx.fillText(en, canvas.width / 2, 126);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
}

function addBox(parent, pose, width, height, depth, y, color, along = 0, normal = 0) {
  const mesh = new THREE.Mesh(boxGeometry, material(color));
  mesh.position.set(
    pose.x + pose.tx * along + pose.nx * normal,
    y,
    pose.z + pose.tz * along + pose.nz * normal
  );
  mesh.rotation.y = pose.yaw;
  mesh.scale.set(width, height, depth);
  parent.add(mesh);
  return mesh;
}

function addSign(parent, pose, en, bn, accent, width = 5.2, height = 1.15, y = 4.4, normal = 1.5) {
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), makeSign(en, bn, accent));
  sign.position.set(pose.x + pose.nx * normal, y, pose.z + pose.nz * normal);
  sign.rotation.y = Math.atan2(pose.nx, pose.nz);
  parent.add(sign);
}

function addLandmark(parent, definition, pose) {
  const landmark = new THREE.Group();
  landmark.name = `world-detail:${definition.en}`;
  landmark.userData.center = { x: pose.x, z: pose.z };
  const concrete = 0xb9b3a5;
  const dark = 0x273337;
  const green = 0x0c7a4e;
  const blue = 0x1d4f8a;

  if (definition.type === 'bus') {
    addBox(landmark, pose, 15, 3.2, 3.2, 1.6, 0x56665d, 0, 0.15);
    addBox(landmark, pose, 16.2, 0.22, 5.8, 4.2, 0x2e3c38, 0, 0.25);
    for (const along of [-6, 6]) addBox(landmark, pose, 0.25, 4.2, 0.25, 2.1, concrete, along, 0.15);
    addSign(landmark, pose, definition.en, definition.bn, '#e4b32a', 5.8, 1.05, 4.15, 0.4);
  } else if (definition.type === 'school') {
    addBox(landmark, pose, 14, 5.8, 2.5, 2.9, 0xa9b7bd, 0, 0.25);
    addBox(landmark, pose, 15, 0.22, 3.2, 5.95, blue, 0, 0.25);
    for (const along of [-5, 0, 5]) addBox(landmark, pose, 1.9, 2.1, 0.08, 3.5, 0x426879, along, 1.55);
    addSign(landmark, pose, definition.en, definition.bn, '#2e70b5', 6.8, 1.15, 5.2, 1.55);
  } else if (definition.type === 'market') {
    addBox(landmark, pose, 14, 3.6, 3.1, 1.8, 0x9b8771, 0, 0.25);
    addBox(landmark, pose, 15, 0.25, 4.2, 3.9, 0x3e4d4b, 0, 0.25);
    for (const along of [-4.5, 0, 4.5]) addBox(landmark, pose, 0.11, 2.0, 0.9, 1.2, 0xf1c55f, along, 1.6);
    addSign(landmark, pose, definition.en, definition.bn, '#d24b32', 6.4, 1.12, 3.25, 1.65);
  } else if (definition.type === 'mosque') {
    addBox(landmark, pose, 12, 3.2, 5.2, 1.6, 0xd7d1c1, 0, 0.25);
    const dome = new THREE.Mesh(domeGeometry, material(0x4c8c7b));
    dome.position.set(pose.x, 4.0, pose.z + pose.nz * 0.25);
    dome.rotation.y = pose.yaw; dome.scale.set(2.5, 1.45, 2.5); landmark.add(dome);
    const minaret = new THREE.Mesh(cylinderGeometry, material(0xe1d8c7));
    minaret.position.set(pose.x + pose.tx * 4.3 + pose.nx * 0.25, 4.0, pose.z + pose.tz * 4.3 + pose.nz * 0.25);
    minaret.scale.set(0.42, 7.5, 0.42); landmark.add(minaret);
    const finial = new THREE.Mesh(coneGeometry, material(0x4c8c7b));
    finial.position.set(minaret.position.x, 7.9, minaret.position.z); finial.scale.set(.7, 1.2, .7); landmark.add(finial);
    addSign(landmark, pose, definition.en, definition.bn, '#0c7a4e', 7.4, 1.2, 3.2, 2.9);
  } else if (definition.type === 'gateway') {
    addBox(landmark, pose, 1.1, 5.8, 1.1, 2.9, green, -5.5, 0.2);
    addBox(landmark, pose, 1.1, 5.8, 1.1, 2.9, green, 5.5, 0.2);
    addBox(landmark, pose, 13, 0.9, 1.1, 5.6, 0xd4d1c5, 0, 0.2);
    addSign(landmark, pose, 'Ahmed Sofa Sarani', 'আহমেদ ছফা সরণি', '#e4b32a', 6.8, 1.1, 5.55, 0.85);
  } else if (definition.type === 'lake') {
    addBox(landmark, pose, 9, 0.18, 0.18, 1.2, 0x8c826d, -3.2, 0.25);
    addBox(landmark, pose, 9, 0.18, 0.18, 1.2, 0x8c826d, 3.2, 0.25);
    for (const along of [-4, 0, 4]) addBox(landmark, pose, 0.18, 1.2, 0.18, 0.8, dark, along, 0.25);
    addSign(landmark, pose, definition.en, definition.bn, '#3d7770', 6.2, 1.05, 2.15, 0.3);
  }
  parent.add(landmark);
}

/** @param {object} scene @param {string} districtKey */
export function buildWorldDetails(scene, districtKey = 'north') {
  const group = new THREE.Group();
  group.name = 'world-details';
  if (districtKey !== 'north') return { group, update() {}, stats: { landmarks: 0 } };

  const landmarks = [];
  for (const definition of DEFINITIONS) {
    const point = namedPoi(scene, definition.names, definition.fallback);
    const pose = nearestRoadPose(scene, point.x, point.z);
    const landmark = new THREE.Group();
    landmark.name = `world-detail-anchor:${definition.en}`;
    landmark.userData.center = { x: pose.x, z: pose.z };
    addLandmark(landmark, definition, pose);
    group.add(landmark);
    landmarks.push(landmark);
  }

  function update(x, z) {
    for (const landmark of landmarks) {
      const center = landmark.userData.center;
      landmark.visible = Math.hypot(x - center.x, z - center.z) < 420;
    }
  }

  return { group, update, stats: { landmarks: landmarks.length } };
}
