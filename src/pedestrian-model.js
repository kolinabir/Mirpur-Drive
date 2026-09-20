import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

class PedestrianGeometryError extends Error {
  constructor() {
    super('Could not merge pedestrian geometry');
    this.name = 'PedestrianGeometryError';
  }
}

function buildGeometry() {
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  /** @param {THREE.BufferGeometry} geometry
   * @param {number[]} position
   * @param {number} color
   * @param {number} tint
   * @param {number} pivot
   * @param {number} swing */
  function add(geometry, position, color, tint = 0, pivot = 0, swing = 0) {
    geometry.translate(position[0], position[1], position[2]);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const joints = new Float32Array(count * 2);
    const tints = new Float32Array(count);
    const shade = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      shade.toArray(colors, i * 3);
      joints[i * 2] = pivot;
      joints[i * 2 + 1] = swing;
      tints[i] = tint;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('joint', new THREE.BufferAttribute(joints, 2));
    geometry.setAttribute('shirtTint', new THREE.BufferAttribute(tints, 1));
    parts.push(geometry);
  }
  try {
    const torso = new THREE.BoxGeometry(0.40, 0.52, 0.23);
    const positions = torso.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < 0) positions.setX(i, positions.getX(i) * 0.8);
    }
    torso.computeVertexNormals();
    add(torso, [0, 1.12, 0], 0xffffff, 1);
    add(new THREE.BoxGeometry(0.30, 0.12, 0.22), [0, 0.83, 0], 0x343945);
    add(new THREE.BoxGeometry(0.105, 0.10, 0.105), [0, 1.42, 0], 0xa77a59);
    add(new THREE.SphereGeometry(0.135, 6, 4), [0, 1.565, 0.005], 0xa77a59);
    add(new THREE.SphereGeometry(0.14, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2),
      [0, 1.60, -0.012], 0x292421);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.125, 0.68, 0.15), [side * 0.09, 0.43, 0],
        0x343945, 0, 0.80, side);
      add(new THREE.BoxGeometry(0.14, 0.10, 0.25), [side * 0.09, 0.05, 0.04],
        0x25272b, 0, 0.80, side);
      add(new THREE.BoxGeometry(0.115, 0.30, 0.14), [side * 0.255, 1.205, 0],
        0xffffff, 1, 1.35, -side * 0.7);
      add(new THREE.BoxGeometry(0.085, 0.25, 0.10), [side * 0.255, 0.94, 0],
        0xa77a59, 0, 1.35, -side * 0.7);
    }
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new PedestrianGeometryError();
    return geometry;
  } finally {
    for (const part of parts) part.dispose();
  }
}

/** A shared mesh and gait buffer: no skeletons or per-person scene objects.
 * @param {number} count */
export function createPedestrianModel(count) {
  const geometry = buildGeometry();
  const gait = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  gait.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('gait', gait);
  const clock = { value: 0 };
  const declarations = `
    attribute vec2 joint;
    attribute vec4 gait;
    attribute float shirtTint;
    uniform float crowdTime;
    mat3 crowdRotation() {
      float phase = gait.x + gait.y * clamp(crowdTime - gait.w, 0.0, 0.08);
      float angle = sin(phase) * gait.z * joint.y;
      float c = cos(angle), s = sin(angle);
      return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
    }
  `;
  /** @param {THREE.Material} material */
  function animate(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.crowdTime = clock;
      shader.vertexShader = declarations + shader.vertexShader
        .replace('#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nobjectNormal = crowdRotation() * objectNormal;')
        .replace('#include <begin_vertex>', `
          vec3 pivot = vec3(0.0, joint.x, 0.0);
          vec3 transformed = crowdRotation() * (position - pivot) + pivot;
        `);
      if (material instanceof THREE.MeshLambertMaterial) {
        shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `
          #include <color_vertex>
          vColor.xyz = color * mix(vec3(1.0), instanceColor.xyz, shirtTint);
        `);
      }
    };
    material.customProgramCacheKey = () => 'pedestrian-gait-v1';
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  animate(material);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'pedestrian-figures';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const distance = new THREE.MeshDistanceMaterial();
  animate(depth);
  animate(distance);
  mesh.customDepthMaterial = depth;
  mesh.customDistanceMaterial = distance;
  const updateClock = () => { clock.value = performance.now() / 1000; };
  mesh.onBeforeRender = updateClock;
  mesh.onBeforeShadow = updateClock;

  const previousX = new Float64Array(count);
  const previousZ = new Float64Array(count);
  const facing = new Float32Array(count);
  const phases = new Float32Array(count);
  const initialized = new Uint8Array(count);
  const dummy = new THREE.Object3D();

  /** @param {number} index @param {number} x @param {number} y
   * @param {number} z @param {number} heading @param {number} scale
   * @param {number} dt @param {boolean} walking */
  function pose(index, x, y, z, heading, scale, dt, walking) {
    const dx = x - previousX[index], dz = z - previousZ[index];
    const distanceMoved = Math.hypot(dx, dz);
    const continuous = initialized[index] === 1 && distanceMoved < 3 && dt > 0;
    const moving = continuous && walking && distanceMoved > 0.0001;
    const target = moving ? Math.atan2(dx, dz) : heading;
    if (continuous) {
      const delta = Math.atan2(Math.sin(target - facing[index]), Math.cos(target - facing[index]));
      facing[index] += delta * (1 - Math.exp(-10 * dt));
    } else {
      facing[index] = heading;
      phases[index] = index * 2.39996;
    }
    const stride = moving ? distanceMoved / scale * 5.4 : 0;
    phases[index] = (phases[index] + stride) % (Math.PI * 2);
    const speed = moving ? Math.min(distanceMoved / dt, 2.5) : 0;
    gait.setXYZW(index, phases[index], moving ? stride / dt : 0,
      Math.min(0.46, speed * 0.32), performance.now() / 1000);
    previousX[index] = x;
    previousZ[index] = z;
    initialized[index] = 1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, facing[index], 0);
    dummy.scale.set(scale * (0.93 + (index % 7) * 0.025), scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  function flush() {
    mesh.instanceMatrix.needsUpdate = true;
    gait.needsUpdate = true;
  }

  return { mesh, pose, flush };
}
