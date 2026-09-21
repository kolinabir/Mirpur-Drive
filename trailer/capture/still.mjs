// Shot-design probe: render single stills from candidate camera poses.
//   node capture/still.mjs poses.json [--format wide|tall] [--scene bijoy]
// poses.json: [{ "name": "m10-aerial", "time": "morning", "rain": false,
//                "pose": { "x": 0, "y": 80, "z": 700, "look": { "x": 150, "y": 10, "z": 600 }, "fov": 50 } }]
import fs from 'node:fs';
import path from 'node:path';
import { launchGame, gpuInfo, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const format = opt('format', 'wide');
const scene = opt('scene', null);
const poses = JSON.parse(fs.readFileSync(file, 'utf8'));
const outDir = path.join(ROOT, 'capture', 'stills');
fs.mkdirSync(outDir, { recursive: true });

const { browser, page, game } = await launchGame({ format, scene });
console.log('gpu', await gpuInfo(page));
await page.evaluate(() => window.__vt.takeover(60));

for (const shot of poses) {
  const b64 = await page.evaluate(async (s) => {
    const cap = window.__cap;
    if (s.time) cap.setTime(s.time);
    if (s.rain != null) cap.M.monsoon.set(!!s.rain);
    cap.pose(s.pose);
    await cap.settle(s.settle ?? 150);
    cap.pose(s.pose);
    cap.vt.step();
    const blob = await cap.grabBlob('image/jpeg', 0.9);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }, shot);
  const out = path.join(outDir, `${shot.name}-${format}.jpg`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('wrote', out);
}
await browser.close();
await game?.close();
process.exit(0);
