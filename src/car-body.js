// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

class CarGeometryError extends Error {
  constructor() { super('Could not assemble the coupe geometry'); this.name = 'CarGeometryError'; }
}

/** @param {THREE.BufferGeometry[]} parts */
function merge(parts) {
  const flattened = parts.map(part => {
    const flat = part.index ? part.toNonIndexed() : part.clone();
    flat.deleteAttribute('uv');
    return flat;
  });
  const geometry = mergeGeometries(flattened);
  for (const part of [...parts, ...flattened]) part.dispose();
  if (!geometry) throw new CarGeometryError();
  return geometry;
}

/** @param {number} w @param {number} h @param {number} d @param {number} x @param {number} y @param {number} z @param {number} [radius] */
function box(w, h, d, x, y, z, radius = .025) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)).translate(x, y, z);
}

/** @param {THREE.Vector3[][]} rings */
function loft(rings) {
  const positions = [];
  const indices = [];
  const n = rings[0].length;
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < n; j++) {
      const a = r * n + j, b = r * n + (j + 1) % n, c = a + n, d = b + n;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let j = 1; j < n - 1; j++) {
    indices.push(0, j, j + 1);
    const end = (rings.length - 1) * n;
    indices.push(end, end + j + 1, end + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** @param {THREE.Vector3[]} points @param {number} radius */
function line(points, radius) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.min(48, Math.max(8, points.length * 8)), radius, 4, false);
}

/** @param {THREE.Texture} envMap */
export function buildCoupeBody(envMap) {
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x9b1528, metalness: .48, roughness: .27,
    clearcoat: 1, clearcoatRoughness: .12, envMap, envMapIntensity: 1.05 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x192c39, metalness: .35, roughness: .13, envMap, envMapIntensity: 1.25 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x14171a, metalness: .15, roughness: .56, envMap });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9da6ae, metalness: .85, roughness: .28, envMap });
  const body = new THREE.Group();
  body.name = 'sculpted-coupe';
  /** @type {THREE.BufferGeometry[]} */
  const painted = [];
  /** @type {THREE.BufferGeometry[]} */
  const dark = [];
  /** @type {THREE.BufferGeometry[]} */
  const chrome = [];
  /** @type {THREE.BufferGeometry[]} */
  const glazing = [];
  const profile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.72, .61, -2.27), new THREE.Vector3(.88, .72, -2.04),
    new THREE.Vector3(.94, .79, -1.35), new THREE.Vector3(.89, .83, -.55),
    new THREE.Vector3(.90, .84, .5), new THREE.Vector3(.96, .83, 1.35),
    new THREE.Vector3(.88, .79, 2.04), new THREE.Vector3(.77, .68, 2.27),
  ]);
  const rings = profile.getPoints(128).map(p => {
    const wheelDistance = Math.min(Math.abs(p.z + 1.35), Math.abs(p.z - 1.35));
    const bottom = wheelDistance < .39 ? .32 + Math.sqrt(.39 ** 2 - wheelDistance ** 2) : .22;
    const sideTop = Math.max(bottom + .025, p.y - .07);
    return [[0, p.y + .025], [.55, p.y + .015], [.83, p.y], [.96, p.y - .025],
      [1, sideTop], [1, bottom + .025], [.96, bottom], [0, bottom],
      [-.96, bottom], [-1, bottom + .025], [-1, sideTop], [-.96, p.y - .025],
      [-.83, p.y], [-.55, p.y + .015]].map(([x, y]) => new THREE.Vector3(x * p.x, y, p.z));
  });
  painted.push(loft(rings));

  // The glass greenhouse is opaque: reflections without a transmission pass.
  const cabinSections = [
    [-.99, .77, .845, .80], [-.34, .64, 1.325, .83],
    [.18, .65, 1.365, .84], [.60, .64, 1.315, .84], [1.30, .78, .855, .83],
  ];
  glazing.push(loft(cabinSections.map(([z, w, y, base]) => [
    new THREE.Vector3(0, y + .015, z), new THREE.Vector3(w * .92, y, z),
    new THREE.Vector3(w, y - .035, z), new THREE.Vector3(.81, base, z),
    new THREE.Vector3(-.81, base, z), new THREE.Vector3(-w, y - .035, z),
    new THREE.Vector3(-w * .92, y, z),
  ])));
  painted.push(loft([[-.35, .64, 1.34], [.05, .66, 1.385], [.40, .66, 1.37], [.61, .64, 1.33]].map(([z, w, y]) => [
    new THREE.Vector3(-w, y - .018, z), new THREE.Vector3(-w * .65, y + .01, z),
    new THREE.Vector3(0, y + .018, z), new THREE.Vector3(w * .65, y + .01, z),
    new THREE.Vector3(w, y - .018, z), new THREE.Vector3(w, y - .035, z),
    new THREE.Vector3(-w, y - .035, z),
  ])));
  for (const side of [-1, 1]) {
    const v = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => new THREE.Vector3(side * x, y, z);
    painted.push(line([v(.79,.85,-.98),v(.70,1.10,-.68),v(.64,1.33,-.34)], .028));
    painted.push(line([v(.64,1.32,.59),v(.73,1.08,.99),v(.80,.86,1.30)], .045));
    dark.push(line([v(.813,.86,-.96),v(.821,.87,0),v(.813,.86,1.27)], .018));
    dark.push(line([v(.66,1.33,.27),v(.74,1.08,.29),v(.82,.86,.31)], .027));
    // Door shut line, flush handle, sill and mirror housing share material batches.
    dark.push(line([v(.896,.77,-.73),v(.91,.55,-.76),v(.896,.31,-.63),v(.897,.29,.57),v(.92,.57,.71),v(.91,.80,.72)], .005));
    chrome.push(box(.014,.026,.15, side*.916,.737,.51,.006));
    dark.push(box(.10,.095,1.82,side*.887,.22,0));
    painted.push(box(.24,.115,.24,side*1.01,.94,-.66,.035));
    dark.push(box(.11,.04,.10,side*.885,.89,-.63));
    chrome.push(box(.175,.069,.015,side*1.02,.948,-.535,.012));
    dark.push(line([v(.44,.77,-1.84),v(.46,.811,-1.43),v(.51,.843,-1.02)], .004));
    // Arch rims follow the same cutout used by the body shell.
    for (const axle of [-1.35, 1.35]) {
      const points = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI * i / 24;
        points.push(v(.943, .32 + Math.sin(a)*.393, axle + Math.cos(a)*.393));
      }
      dark.push(line(points,.012));
    }
  }
  dark.push(box(1.13,.21,.075,0,.405,-2.23));
  dark.push(box(1.52,.065,.20,0,.235,-2.18));
  dark.push(box(1.35,.16,.10,0,.36,2.235));
  for(let i=-5;i<=5;i++) chrome.push(box(.018,.115,.009,i*.083,.41,-2.272,.003));
  for(const side of [-1,1]) {
    dark.push(box(.34,.125,.09,side*.62,.585,-2.15));
    dark.push(box(.35,.115,.085,side*.63,.675,2.145));
    for(let i=0;i<3;i++) dark.push(box(.025,.10,.20,side*(.22+i*.16),.28,2.19));
  }
  const plate = new THREE.MeshStandardMaterial({color:0xd5ddd7,roughness:.65,metalness:.1});
  const plates = merge([box(.40,.105,.014,0,.555,2.26,.009),box(.40,.10,.014,0,.42,-2.284,.008)]);
  const plateMesh = new THREE.Mesh(plates,plate); plateMesh.name='number-plates';body.add(plateMesh);
  for(const [name,parts,material] of /** @type {[string, THREE.BufferGeometry[], THREE.Material][]} */ ([
    ['paint',painted,paint], ['glass',glazing,glass], ['trim',dark,trim], ['metal',chrome,metal],
  ])) {
    const mesh = new THREE.Mesh(merge(parts),material);mesh.name=`coupe-${name}`;body.add(mesh);
  }
  return {body,paint};
}

/** @param {THREE.Texture} envMap */
export function buildCoupeWheel(envMap) {
  const wheel = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({color:0x17191b,roughness:.88,metalness:0});
  const alloy = new THREE.MeshStandardMaterial({color:0xabb5c0,roughness:.25,metalness:.85,envMap});
  const tire = new THREE.TorusGeometry(.257,.063,10,40);tire.rotateY(Math.PI/2);tire.scale(1.7,1,1);
  const tireParts = [tire];
  for (const side of [-1,1]) {
    const bead = new THREE.TorusGeometry(.227,.009,4,40);bead.rotateY(Math.PI/2);bead.translate(side*.095,0,0);tireParts.push(bead);
    for(let i=0;side === 1 && i<40;i++) {
      const a=i*Math.PI/20;
      const groove=new THREE.BoxGeometry(.115,.004,.014);groove.translate(0,.320,0);groove.rotateX(a);tireParts.push(groove);
    }
  }
  wheel.add(new THREE.Mesh(merge(tireParts),rubber));
  const parts=[];
  for(const side of [-1,1]) {
    const rim = new THREE.TorusGeometry(.216,.018,6,40);rim.rotateY(Math.PI/2);rim.translate(side*.10,0,0);parts.push(rim);
    const hub = new THREE.CylinderGeometry(.053,.053,.025,16);hub.rotateZ(Math.PI/2);hub.translate(side*.112,0,0);parts.push(hub);
    for(let i=0;i<5;i++) for(const offset of [-.065,.065]) {
      const spoke=new THREE.BoxGeometry(.028,.165,.018).translate(side*.105,.129,0);spoke.rotateX(i*Math.PI*2/5+offset);parts.push(spoke);
    }
  }
  wheel.add(new THREE.Mesh(merge(parts),alloy));
  return wheel;
}
