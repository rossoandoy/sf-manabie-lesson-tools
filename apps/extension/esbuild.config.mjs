import * as esbuild from 'esbuild';
import { cpSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'));
const buildStamp = `lesson-tools v${manifest.version} built=${new Date().toISOString()}`;

const serviceWorkerOptions = {
  entryPoints: ['background/service-worker.ts'],
  bundle: true,
  outdir: 'dist/background',
  outbase: 'background',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

const contentScriptOptions = {
  entryPoints: ['content/detector.ts'],
  bundle: true,
  outdir: 'dist/content',
  outbase: 'content',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

const pageOptions = {
  entryPoints: ['popup/popup.ts', 'dashboard/dashboard.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

function copyStatic() {
  const staticFiles = [
    ['manifest.json', 'dist/manifest.json'],
    ['popup/popup.html', 'dist/popup/popup.html'],
    ['popup/popup.css', 'dist/popup/popup.css'],
    ['dashboard/dashboard.css', 'dist/dashboard/dashboard.css'],
    ['dashboard/dashboard.html', 'dist/dashboard/dashboard.html'],
    ['icons', 'dist/icons'],
    ['data', 'dist/data'],
  ];
  for (const [src, dest] of staticFiles) {
    const srcPath = resolve(__dirname, src);
    if (existsSync(srcPath)) {
      cpSync(srcPath, resolve(__dirname, dest), { recursive: true });
    }
  }
  writeFileSync(
    resolve(__dirname, 'dist/BUILD_INFO.json'),
    `${JSON.stringify({ stamp: buildStamp, version: manifest.version }, null, 2)}\n`,
  );
}

if (watch) {
  const [ctxSw, ctxContent, ctxPages] = await Promise.all([
    esbuild.context(serviceWorkerOptions),
    esbuild.context(contentScriptOptions),
    esbuild.context(pageOptions),
  ]);
  copyStatic();
  await Promise.all([ctxSw.watch(), ctxContent.watch(), ctxPages.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(serviceWorkerOptions),
    esbuild.build(contentScriptOptions),
    esbuild.build(pageOptions),
  ]);
  copyStatic();
  console.log('Build complete.');
}
