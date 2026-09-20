import * as THREE from 'three';

const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

/** @param {THREE.Scene} world */
export function createCinematicClearance(world) {
  /** @type {THREE.Mesh[]} */
  let meshes = [];
  const ray = new THREE.Raycaster();
  const delta = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const sweep = new THREE.Box3();
  const collisionMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  /** @type {THREE.Intersection[]} */
  const hits = [];

  /** @param {THREE.Vector3} centre */
  function refresh(centre) {
    meshes = [];
    world.updateMatrixWorld(true);
    world.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((material) => !material.depthWrite || material instanceof THREE.ShaderMaterial)) return;
      const localBounds = new THREE.Box3().setFromObject(object);
      if (localBounds.distanceToPoint(centre) < 450) meshes.push(object);
    });
  }

  /** @param {THREE.Vector3} from @param {THREE.Vector3} to @param {number} skin */
  function isClear(from, to, skin = .8) {
    sweep.makeEmpty().expandByPoint(from).expandByPoint(to).expandByScalar(skin);
    const candidates = meshes.filter((mesh) => {
      // Recheck parents: train visibility can change between shots.
      for (let parent = mesh; parent; parent = parent.parent) if (!parent.visible) return false;
      if (mesh instanceof THREE.InstancedMesh) {
        if (!mesh.boundingBox) mesh.computeBoundingBox();
        bounds.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      }
      return bounds.intersectsBox(sweep);
    });
    if (!candidates.length) return true;
    /** @param {THREE.Vector3} start @param {THREE.Vector3} direction @param {number} length */
    function hit(start, direction, length) {
      ray.set(start, direction); ray.near = 0; ray.far = length;
      for (const mesh of candidates) {
        const material = mesh.material;
        // Two-sided geometry catches roofs and wall backs as well as fronts.
        mesh.material = Array.isArray(material) ? material.map(() => collisionMaterial) : collisionMaterial;
        hits.length = 0;
        try { mesh.raycast(ray, hits); } finally { mesh.material = material; }
        if (hits.length) return true;
      }
      return false;
    }
    delta.subVectors(to, from);
    const distance = delta.length();
    if (distance > .0001) {
      delta.divideScalar(distance);
      if (hit(from, delta, distance + skin)) return false;
      for (const axis of axes) {
        origin.copy(from).addScaledVector(axis, skin);
        if (hit(origin, delta, distance)) return false;
      }
    }
    for (const axis of axes) if (hit(to, axis, skin)) return false;
    return true;
  }
  return { refresh, isClear };
}
