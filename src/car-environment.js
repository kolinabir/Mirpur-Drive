// @ts-check
import * as THREE from 'three';

class CarEnvironmentError extends Error {
  constructor() { super('Car reflection canvas is unavailable'); this.name = 'CarEnvironmentError'; }
}

/** A static outdoor probe, generated once; no extra scene renders per frame.
 * @param {THREE.WebGLRenderer} renderer
 */
export function createCarEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CarEnvironmentError();
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#719bcc');
  sky.addColorStop(.38, '#bad1e5');
  sky.addColorStop(.49, '#e2e5df');
  sky.addColorStop(.51, '#767976');
  sky.addColorStop(1, '#3a3d3b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 24; i++) {
    const h = 12 + (i * 17 % 31);
    ctx.fillStyle = i % 3 === 0 ? '#69737b' : '#929896';
    ctx.fillRect(i * 23, 128 - h, 15 + i % 7, h + 6);
  }
  const sunlight = ctx.createRadialGradient(145, 62, 2, 145, 62, 47);
  sunlight.addColorStop(0, 'rgba(255,250,232,1)');
  sunlight.addColorStop(.18, 'rgba(255,250,232,.75)');
  sunlight.addColorStop(1, 'rgba(255,250,232,0)');
  ctx.fillStyle = sunlight;
  ctx.fillRect(90, 5, 110, 115);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromEquirectangular(texture).texture;
  } finally {
    texture.dispose();
    generator.dispose();
  }
}
