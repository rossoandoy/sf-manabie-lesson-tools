import { existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const outDir = resolve(root, '../../dist-packages');

if (!existsSync(dist)) {
  console.error('dist/ not found. Run npm run build first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const zipName = `manabie-lesson-tools-v${pkg.version}.zip`;
const zipPath = resolve(outDir, zipName);

execSync(`cd "${dist}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
console.log(`Created ${zipPath}`);
