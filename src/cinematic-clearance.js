import * as THREE from 'three';

const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

/** @param {THREE.Scene} world */
export function createCinematicClearance(world) {
  /** @type {THREE.Mesh[]} */
  let meshes = [];
  /** Traffic and pedestrians: they can veto a cut, never stall a move (see isClear). @type {Set<THREE.Mesh>} */
  const moving = new Set();
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
    moving.clear();
    world.updateMatrixWorld(true);
    world.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // Street dressing (posters, bamboo, festoons, rain) is not an obstacle, and
      // an InstancedMesh of a few thousand poles is ray-tested instance by instance.
      for (let parent = object; parent; parent = parent.parent) if (parent.userData.cinematicIgnore) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((material) => !material.depthWrite || material instanceof THREE.ShaderMaterial)) return;
      const localBounds = new THREE.Box3().setFromObject(object);
      if (localBounds.distanceToPoint(centre) >= 450) return;
      meshes.push(object);
      for (let parent = object; parent; parent = parent.parent) if (parent.name === 'traffic' || parent.name === 'pedestrians') moving.add(object);
    });
  }

  /**
   * `thorough` sweeps the camera's whole skin (13 rays) and is for cuts, which
   * happen behind black. Between cuts the shots are authored moves through
   * space already proven clear, so one ray down the centre of the move is the
   * safety net: these meshes have no BVH, and 13 rays a frame was 2-6 ms on a
   * fast laptop, which is the whole frame on a slow one. Moving agents are
   * left out of that per-frame test: a rickshaw crossing the path used to
   * freeze the camera until it cleared and then snap it forward, which reads
   * far worse than the lens brushing past a hood.
   * @param {THREE.Vector3} from @param {THREE.Vector3} to @param {number} skin @param {boolean} thorough
   */
  function isClear(from, to, skin = .8, thorough = true) {
    sweep.makeEmpty().expandByPoint(from).expandByPoint(to).expandByScalar(skin);
    const candidates = meshes.filter((mesh) => {
      if (!thorough && moving.has(mesh)) return false;
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
      if (!thorough) return true;
      for (const axis of axes) {
        origin.copy(from).addScaledVector(axis, skin);
        if (hit(origin, delta, distance)) return false;
      }
    }
    if (!thorough) return true;
    for (const axis of axes) if (hit(to, axis, skin)) return false;
    return true;
  }
  return { refresh, isClear };
}
