// Contact sheet of preview frames, for reviewing shots at a glance.
//   node capture/contact.mjs <dir> <out.jpg> [filter] [cols]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [dir, out, filter = '', cols = '4'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg') && f.includes(filter)).sort();
const tall = dir.includes('tall');
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;font:12px monospace;color:#fff">${files.map((f) => `<div style="position:relative"><img src="file://${path.resolve(dir, f)}" style="width:100%;display:block"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">${f.replace('.jpg', '')}</span></div>`).join('')}</body>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: tall ? 1400 : 1800, height: 800 } });
const tmp = path.resolve(dir, '_contact.html');
fs.writeFileSync(tmp, html);
await page.goto(`file://${tmp}`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 80 });
await browser.close();
fs.rmSync(tmp);
console.log('contact sheet', out, files.length, 'frames');
