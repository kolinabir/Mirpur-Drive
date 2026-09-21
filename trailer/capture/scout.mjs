// Scout camera positions in a running capture/serve.mjs session.
//   node capture/scout.mjs poses.json
// poses.json: [{ name, time?, rain?, settle?, js? , pose? }] — `js` is a snippet
// (with `cap` in scope) run before the still; `pose` goes to cap.pose().
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { HERE, ROOT } from './lib.mjs';

const poses = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts()[0].pages().find((p) => /localhost|127\.0\.0\.1/.test(p.url()));
await page.addScriptTag({ path: path.join(HERE, 'page-shots.js') });
const dir = path.join(ROOT, 'capture', 'stills', 'scout');
fs.mkdirSync(dir, { recursive: true });
for (const s of poses) {
  const b64 = await page.evaluate(async (s) => {
    const cap = window.__cap;
    if (window.__driveDebug.driving) window.__driveDebug.toggleDrive();
    if (s.time) cap.setTime(s.time);
    cap.M.monsoon.set(!!s.rain);
    if (s.pose) cap.pose(s.pose);
    await cap.settle(s.settle ?? 100);
    let note;
    if (s.js) note = await new Function('cap', `return (async () => { ${s.js} })()`)(cap);
    if (s.pose && !s.js) cap.pose(s.pose);
    cap.hideLabels();
    cap.vt.step();
    const blob = await cap.grabBlob('image/jpeg', 0.8);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { img: btoa(bin), note };
  }, s);
  fs.writeFileSync(path.join(dir, `${s.name}.jpg`), Buffer.from(b64.img, 'base64'));
  console.log('scout', s.name, b64.note !== undefined ? JSON.stringify(b64.note) : '');
}
await browser.close();
