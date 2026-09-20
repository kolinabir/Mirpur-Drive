import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

class FacadeTextureError extends Error {
  /** @param {string} name @param {unknown} cause */
  constructor(name, cause) {
    super(`Unable to load facade texture: ${name}`, { cause });
    this.name = 'FacadeTextureError';
  }
}

/** @param {THREE.WebGLRenderer} renderer */
export async function loadFacadeTextures(renderer) {
  const compressed = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2);
  compressed.detectSupport(renderer);
  const fallback = new THREE.TextureLoader();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  /** @param {string} name @param {boolean} srgb */
  async function load(name, srgb) {
    /** @type {THREE.Texture} */
    let texture;
    try {
      texture = await compressed.loadAsync(`/textures/facades/${name}.ktx2`);
    } catch (cause) {
      console.warn(`Compressed facade ${name} unavailable; using PNG fallback.`, cause);
      try {
        texture = await fallback.loadAsync(`/textures/facades/${name}.png`);
        texture.flipY = false;
      } catch (fallbackCause) {
        throw new FacadeTextureError(name, fallbackCause);
      }
    }
    texture.flipY = false;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.wrapS = texture.wrapT = name === 'roof' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  try {
    const [texture, emissiveTexture, normal, roughness, roof] = await Promise.all([
      load('color', true), load('emissive', true), load('normal', false), load('roughness', false), load('roof', true),
    ]);
    return { texture, emissiveTexture, normal, roughness, roof };
  } finally {
    compressed.dispose();
  }
}
