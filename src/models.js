/**
 * models.js (P4-CAR)
 *
 * Small, generic glTF loading module. Written for src/drive.js's car mesh
 * but deliberately kept free of any drive.js-specific logic — P6-TRAFFIC is
 * expected to `import` this file unchanged for the vehicle fleet, so keep
 * the API surface here small and stable.
 *
 * API
 * ---
 * loadModel(url) -> Promise<THREE.Group>
 *   Loads a glTF/GLB from `url` (relative to /public, e.g. '/models/car-kit/
 *   sedan.glb'). Results are cached by url — a second call for the same url
 *   returns (a clone of) the same cached promise's result instantly, it does
 *   not re-fetch or re-parse. The resolved value is `gltf.scene` (a
 *   THREE.Group), NOT cloned — callers that need multiple independent
 *   instances (e.g. a traffic fleet) should call `cloneModel(group)` on the
 *   result rather than reusing the cached group directly, since two owners
 *   mutating the same Object3D's transform would fight each other.
 *
 * cloneModel(group) -> THREE.Group
 *   SkeletonUtils-free deep clone (geometries/materials are shared/reused,
 *   only the Object3D graph + transforms are copied) suitable for static
 *   (non-skinned) props/vehicles. Safe to call many times on one loaded
 *   model to instantiate a fleet.
 *
 * disposeAll() -> void
 *   Disposes every geometry/material/texture this module has ever handed
 *   out and clears the promise cache. Call on full teardown only (e.g. hot
 *   reload in dev) — normal per-instance cleanup should dispose the clone's
 *   own geometries directly, since geometries/materials are shared across
 *   clones of the same source model.
 *
 * Conventions
 * -----------
 * This repo's local-space convention is **forward = -Z** (see drive.js's
 * `forwardOf(yaw)`). Source assets are not guaranteed to match that — the
 * Kenney Car Kit sedan, for instance, has its hood at local +Z in the raw
 * geometry (confirmed empirically, not from the glTF node names, which
 * turned out not to be a reliable signal for this kit). `loadModel()` does
 * NOT rotate or otherwise touch the loaded scene's orientation — that is
 * asset-specific and stays the caller's job (e.g. drive.js's
 * `buildModelCarMesh()` rotates the extracted body mesh 180 deg about Y).
 * Keep it that way so this module stays agnostic to any one asset's
 * authoring convention; a future caller (P6-TRAFFIC) should verify its own
 * fleet models by rendering them, the same way this pass caught the sedan's
 * orientation, rather than trusting node names.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// One loader instance, reused for every load (per three.js's own guidance —
// loaders are cheap to reuse and hold no per-load state after `load()`
// resolves). Draco support is wired in case a future asset needs it; the
// current sedan.glb does not use Draco/meshopt compression.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// url -> Promise<THREE.Group>
const cache = new Map();
// Every geometry/material/texture ever produced, for disposeAll().
const owned = new Set();

function trackMaterial(mat) {
  owned.add(mat);
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
    if (mat[key]) owned.add(mat[key]);
  }
}

/**
 * Loads a glTF/GLB model, caching by url. Returns the *shared* scene graph
 * — callers wanting independent instances should use `cloneModel()`.
 */
export function loadModel(url) {
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene || gltf.scenes[0];
        scene.traverse((obj) => {
          if (obj.isMesh) {
            owned.add(obj.geometry);
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(trackMaterial);
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        resolve(scene);
      },
      undefined,
      (err) => reject(err),
    );
  });

  cache.set(url, promise);
  return promise;
}

/**
 * Deep-clones a loaded model's Object3D graph. Geometries and materials are
 * shared (not duplicated) across clones, matching three.js's own
 * `Object3D.clone()` behaviour — safe for many static instances (e.g. a
 * traffic fleet), not intended for skinned/animated clones.
 */
export function cloneModel(group) {
  return group.clone(true);
}

/** Disposes every geometry/material/texture this module has ever produced. */
export function disposeAll() {
  for (const item of owned) {
    item.dispose?.();
  }
  owned.clear();
  cache.clear();
  dracoLoader.dispose();
}
