#!/usr/bin/env node
/**
 * tools/convert-textures.mjs
 *
 * Converts all PBR texture JPGs/PNGs in public/textures/ to WebP format.
 * - Color maps: WebP quality 82 (visually lossless, ~50% smaller than JPEG)
 * - Normal/Roughness/AO maps: WebP quality 75 (~60% smaller, low-frequency data)
 * - AO/Roughness maps: downscaled to 512x512 (half res, visually identical)
 *
 * Requires: `npm install --save-dev sharp` (or `npx sharp`)
 *
 * After running, updates MANIFEST.json to point to .webp files.
 *
 * Usage:
 *   node tools/convert-textures.mjs          # convert and update manifest
 *   node tools/convert-textures.mjs --dry    # show what would be done
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';

const TEXTURES_DIR = 'public/textures';
const MANIFEST_PATH = join(TEXTURES_DIR, 'MANIFEST.json');

const DRY_RUN = process.argv.includes('--dry');

// Quality settings per map type
const QUALITY = {
  color: 82,
  normal: 75,
  roughness: 70,
  ao: 70,
};

// Maps that can safely be downscaled to 512x512
const DOWNSCALE_TYPES = new Set(['ao', 'roughness']);

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Error: sharp is not installed. Run: npm install --save-dev sharp');
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));
  let totalOriginal = 0;
  let totalConverted = 0;
  let filesProcessed = 0;

  for (const material of manifest.materials || []) {
    const maps = material.maps || {};

    for (const [type, relPath] of Object.entries(maps)) {
      if (!relPath) continue;
      const ext = extname(relPath).toLowerCase();
      if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') continue;

      const srcPath = join(TEXTURES_DIR, relPath);
      const webpPath = relPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      const dstPath = join(TEXTURES_DIR, webpPath);
      const quality = QUALITY[type] || 75;
      const shouldDownscale = DOWNSCALE_TYPES.has(type);

      try {
        const srcStat = await stat(srcPath);
        totalOriginal += srcStat.size;

        if (DRY_RUN) {
          console.log(`[dry] ${relPath} → ${webpPath} (q${quality}${shouldDownscale ? ', 512px' : ''})`);
          continue;
        }

        let pipeline = sharp(srcPath);

        if (shouldDownscale) {
          pipeline = pipeline.resize(512, 512, { fit: 'fill' });
        }

        await pipeline.webp({ quality, effort: 4 }).toFile(dstPath);

        const dstStat = await stat(dstPath);
        totalConverted += dstStat.size;
        filesProcessed++;

        const savings = ((1 - dstStat.size / srcStat.size) * 100).toFixed(0);
        console.log(
          `✓ ${relPath} → ${webpPath}  ` +
          `${(srcStat.size / 1024).toFixed(0)}K → ${(dstStat.size / 1024).toFixed(0)}K  ` +
          `(−${savings}%)`
        );

        // Update manifest to point to WebP
        maps[type] = webpPath;

      } catch (err) {
        console.warn(`⚠ Skipped ${relPath}: ${err.message}`);
      }
    }
  }

  if (!DRY_RUN && filesProcessed > 0) {
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    const savingsMB = ((totalOriginal - totalConverted) / 1024 / 1024).toFixed(1);
    const pct = ((1 - totalConverted / totalOriginal) * 100).toFixed(0);
    console.log(
      `\n✅ Converted ${filesProcessed} textures. ` +
      `${(totalOriginal / 1024 / 1024).toFixed(1)} MB → ${(totalConverted / 1024 / 1024).toFixed(1)} MB ` +
      `(saved ${savingsMB} MB, −${pct}%)`
    );
    console.log('   MANIFEST.json updated with .webp paths.');
  } else if (DRY_RUN) {
    console.log('\n[dry run — no files written]');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
