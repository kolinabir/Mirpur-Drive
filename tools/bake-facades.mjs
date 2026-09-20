#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const run = promisify(execFile);
const root = path.resolve(decodeURIComponent(new URL('..', import.meta.url).pathname));
const cacheDir = path.join(root, '.cache', 'facades');
const outDir = path.join(root, 'public', 'textures', 'facades');
const basisDir = path.join(root, 'public', 'basis');
const missingSources = [];

class FacadeBakeError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'FacadeBakeError';
  }
}

function basisBinary() {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : process.platform === 'win32' ? 'win32' : null;
  if (!platform) throw new FacadeBakeError(`Unsupported platform for Basis encoder: ${process.platform}`);
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  if (platform === 'win32') return path.join(root, 'node_modules', '@gpu-tex-enc', 'basis', 'bin', `${platform}-${arch}`, 'basisu.exe');
  return path.join(root, 'node_modules', '@gpu-tex-enc', 'basis', 'bin', `${platform}-${arch}`, 'basisu');
}

async function encode(name, linear, uastc) {
  const input = path.join(cacheDir, `${name}.png`);
  const args = ['-ktx2', '-mipmap', '-max_threads', '4'];
  if (uastc) args.push('-uastc');
  if (linear) args.push('-linear');
  args.push(input);
  try {
    await run(basisBinary(), args, { cwd: cacheDir, maxBuffer: 2 * 1024 * 1024 });
    const generated = path.join(cacheDir, `${name}.ktx2`);
    await fs.copyFile(generated, path.join(outDir, `${name}.ktx2`));
  } catch (cause) {
    throw new FacadeBakeError(`Basis encoding failed for ${name}`, cause);
  }
}

async function main() {
  globalThis.document = { createElement: (type) => {
    if (type !== 'canvas') throw new FacadeBakeError(`Unsupported document element: ${type}`);
    return createCanvas(1, 1);
  }};
  const { buildFacadeAtlas, buildRoofTexture } = await import('../src/facades.js');
  const imageLoader = async (slug, mapName) => {
    const file = path.join(root, 'public', 'textures', slug, `${mapName}.jpg`);
    try { return await loadImage(file); } catch {
      missingSources.push({ slug, mapName, file });
      return null;
    }
  };
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(basisDir, { recursive: true });
  let atlas;
  try { atlas = await buildFacadeAtlas({ imageLoader }); }
  catch (cause) { throw new FacadeBakeError('Facade atlas generation failed', cause); }
  if (missingSources.length) {
    console.warn('Missing facade source maps:');
    for (const source of missingSources) console.warn(`  ${source.mapName}: ${source.slug} (${source.file})`);
    if (missingSources.some((source) => source.mapName === 'color')) {
      throw new FacadeBakeError('Required color facade source maps are missing');
    }
  }
  let roof;
  try { roof = buildRoofTexture(); }
  catch (cause) { throw new FacadeBakeError('Roof texture generation failed', cause); }
  const canvases = {
    color: atlas.canvas,
    emissive: atlas.emissiveCanvas,
    normal: atlas.normalCanvas,
    roughness: atlas.roughnessCanvas,
    roof: roof?.image,
  };
  for (const [name, canvas] of Object.entries(canvases)) {
    if (!canvas?.toBuffer) throw new FacadeBakeError(`Atlas did not return ${name} canvas`);
    // Compressed textures cannot flip at upload; match the existing bottom-up UVs.
    const flipped = createCanvas(canvas.width, canvas.height);
    const ctx = flipped.getContext('2d');
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, 0);
    await fs.writeFile(path.join(cacheDir, `${name}.png`), flipped.toBuffer('image/png'));
    await fs.copyFile(path.join(cacheDir, `${name}.png`), path.join(outDir, `${name}.png`));
  }
  await encode('color', false, false);
  await encode('emissive', false, false);
  await encode('normal', true, true);
  await encode('roughness', true, true);
  await encode('roof', false, false);
  for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
    await fs.copyFile(path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', file), path.join(basisDir, file));
  }
  console.log(`Baked facades to ${outDir}`);
}

main().catch((cause) => {
  const error = cause instanceof FacadeBakeError ? cause : new FacadeBakeError('Facade bake failed', cause);
  console.error(`${error.name}: ${error.message}`);
  if (error.cause?.stderr) console.error(error.cause.stderr.trim());
  process.exitCode = 1;
});
