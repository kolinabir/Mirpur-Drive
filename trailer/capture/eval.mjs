// Run a snippet in the serve.mjs session and optionally save a still.
//   node capture/eval.mjs script.js [--still name] [--port 9333]
// The script body runs as an async function with `cap` (= window.__cap) in scope.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const body = fs.readFileSync(args[0], 'utf8');
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${opt('port', 9333)}`);
const page = browser.contexts()[0].pages().find((p) => /localhost|127\.0\.0\.1/.test(p.url()));
const result = await page.evaluate(`(async () => { const cap = window.__cap; ${body} })()`);
if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
const still = opt('still', null);
if (still) {
  const b64 = await page.evaluate(async () => {
    // Render a fresh frame and read it in the same task: the WebGL drawing
    // buffer is cleared once the browser presents it.
    window.__cap.vt.step();
    const blob = await window.__cap.grabBlob('image/jpeg', 0.88);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  const dir = path.join(ROOT, 'capture', 'stills');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${still}.jpg`), Buffer.from(b64, 'base64'));
  console.log('still', `${still}.jpg`);
}
await browser.close();
