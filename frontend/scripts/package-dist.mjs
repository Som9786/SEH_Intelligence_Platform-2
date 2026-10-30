// Turns dist into a folder that runs on any machine with Node.js: adds the launcher files from
// scripts/serve and drops build copies of local-only folders. The catalog is not part of it: the APIs behind the gateway serve it.
//
//   npm run package
import { copyFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(projectRoot, 'dist');
const launcher = path.join(projectRoot, 'scripts', 'serve');

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(
    'package-dist: dist/index.html not found. Run "npm run build" first.',
  );
  process.exit(1);
}

// Vite copies everything in public/, including local backups such as public/catalog-backup.
for (const entry of await readdir(dist, { withFileTypes: true }))
  if (entry.isDirectory() && entry.name.startsWith('catalog-'))
    await rm(path.join(dist, entry.name), { recursive: true, force: true });

for (const file of await readdir(launcher))
  await copyFile(path.join(launcher, file), path.join(dist, file));

console.log(
  'package-dist: dist is ready. Copy the folder anywhere and run start.cmd or start.sh (the API gateway must be running).',
);
