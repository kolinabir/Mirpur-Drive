// Render the synthesized score (capture/music-page.js) to public/audio/music.wav.
// Web Audio only exists in a browser, so this borrows headless Chrome for it.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { HERE, ROOT } from './lib.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.addScriptTag({ path: path.join(HERE, 'music-page.js') });
const started = Date.now();
const b64 = await page.evaluate(async () => {
  const { left, right } = await window.renderTrailerMusic();
  // Normalize to -1 dBFS, interleave to 16-bit PCM.
  let peak = 0;
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const k = peak > 0 ? 0.891 / peak : 1;
  const pcm = new Int16Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(left[i] * k * 32767)));
    pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(right[i] * k * 32767)));
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { pcm: btoa(bin), rawPeak: peak };
});
await browser.close();

const pcm = Buffer.from(b64.pcm, 'base64');
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
const out = path.join(ROOT, 'public', 'audio', 'music.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, pcm]));

// Loudness per section, as a sanity check nobody has to listen for.
const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
const rms = (a, b) => { let sum = 0, n = 0; for (let i = Math.floor(a * 48000) * 2; i < Math.floor(b * 48000) * 2 && i < samples.length; i++) { sum += (samples[i] / 32768) ** 2; n++; } return +(10 * Math.log10(sum / n + 1e-12)).toFixed(1); };
console.log(`music.wav ${(pcm.length / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s, raw peak ${b64.rawPeak.toFixed(3)}`);
console.log('RMS dBFS', { intro: rms(0, 12), main: rms(12, 34), breakdown: rms(34, 42), climax: rms(42, 52), outro: rms(52, 60) });
