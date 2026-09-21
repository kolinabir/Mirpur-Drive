// Record shots frame by frame and encode them for Remotion.
//   node capture/capture.mjs <shot|all> [--format wide|tall] [--preview] [--attach] [--scene bijoy]
// --preview keeps one frame in 30 (shot design). --attach reuses a running
// capture/serve.mjs session instead of booting the game again.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { launchGame, frameServer, gpuInfo, HERE, ROOT, FORMATS } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const which = args.find((a) => !a.startsWith('--')) || 'all';
const format = opt('format', 'wide');
const preview = flag('preview');
const every = preview ? Number(opt('every', 30)) : 1;

let browser, page, game;
if (flag('attach')) {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${opt('port', 9333)}`);
  page = browser.contexts()[0].pages().find((p) => /localhost|127\.0\.0\.1/.test(p.url()));
} else {
  ({ browser, page, game } = await launchGame({ format, scene: opt('scene', null) }));
  console.log('gpu', await gpuInfo(page));
  await page.evaluate(() => window.__vt.takeover(60));
}
// Always load the current helpers and shot list (both are idempotent).
await page.addScriptTag({ path: path.join(HERE, 'page-shots.js') });
await page.addScriptTag({ path: path.join(HERE, 'shots.js') });

const names = await page.evaluate(() => Object.keys(window.__shots));
const todo = which === 'all' ? names : which.split(',');
const framesRoot = path.join(ROOT, 'capture', preview ? 'stills' : 'frames', format);
const footage = path.join(ROOT, 'public', 'footage', format);
fs.mkdirSync(footage, { recursive: true });

for (const name of todo) {
  if (!names.includes(name)) { console.error(`unknown shot ${name}; have: ${names.join(', ')}`); continue; }
  const dir = preview ? framesRoot : path.join(framesRoot, name);
  if (!preview) fs.rmSync(dir, { recursive: true, force: true });
  const server = await frameServer(dir);
  const started = Date.now();
  const result = await page.evaluate(([n, o]) => window.__cap.runShot(n, o), [name, { port: server.port, every, format, quality: preview ? 0.8 : 0.95 }]);
  await server.close();
  console.log(`${name}: ${result.frames} frames simulated, ${server.count} saved in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (result.log?.length) console.log(JSON.stringify(result.log));
  if (preview) continue;

  // Encode with the ffmpeg that ships inside Remotion (no system ffmpeg needed).
  // The 1.5x supersampled frames are scaled to the delivery size here.
  const { width, height } = FORMATS[format];
  const out = path.join(footage, `${name}.mp4`);
  execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-loglevel', 'error', '-framerate', '60', '-i', path.join(dir, `${name}_%05d.jpg`),
    '-vf', `scale=${width}:${height}:flags=lanczos`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('encoded', path.relative(ROOT, out), `${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  // ~2 MB per supersampled frame: drop them once the clip exists unless asked to keep them.
  if (!flag('keep-frames')) fs.rmSync(dir, { recursive: true, force: true });
}
await browser.close();
// The static game server would otherwise keep the process alive.
await game?.close();
process.exit(0);
