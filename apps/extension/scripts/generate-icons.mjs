#!/usr/bin/env node
/**
 * Rasterize apps/extension/icons/icon.svg → icon16/48/128.png
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');
const svg = readFileSync(join(iconsDir, 'icon.svg'));

const sizes = [16, 48, 128];
for (const size of sizes) {
  const out = join(iconsDir, `icon${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`Wrote ${out}`);
}
