// Copies a generated metadata catalog into its database's folder in DB Catalog's catalog folder,
// which DB Catalog's API serves to the UI. DB Catalog keeps one folder per database.
//
//   npm run sync-data -- <path-to-catalog> [database]
//
// The folder is named after the database (database.json's database.name) unless [database] gives
// another name. Only that database's folder is replaced; its db-catalog.json (the page's questions
// and synonyms) is kept. The catalog's database.json lists everything that is published: the
// documents and each table's detail file. relationships.json and business-areas.json are copied
// beside it. Nothing else is copied; sample data files (*.data.json) are refused, because they are
// input to the offline AI documentation process only and must not be served by the web application.
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const catalogRoot = path.resolve(
  projectRoot,
  '../backend/src/Insights.DbCatalog/catalog',
);
const GUIDE_FILE = 'db-catalog.json';

const fail = (message) => {
  console.error(`sync-data: ${message}`);
  process.exit(1);
};
const isSampleData = (file) => file.toLowerCase().endsWith('.data.json');

if (!process.argv[2])
  fail('usage: npm run sync-data -- <path-to-catalog> [database]');
const source = path.resolve(projectRoot, process.argv[2]);
if (!existsSync(path.join(source, 'database.json')))
  fail(`database.json not found in ${source}`);

const catalog = JSON.parse(
  await readFile(path.join(source, 'database.json'), 'utf8'),
);
if (!Array.isArray(catalog.tables)) fail('database.json has no tables array.');

const database = process.argv[3] ?? catalog.database?.name;
if (!database)
  fail(
    'database.json names no database; pass the folder name: npm run sync-data -- <path> <database>',
  );
if (!/^[A-Za-z0-9_.-]+$/.test(database) || /^\.+$/.test(database))
  fail(`${database} can't be a folder name; use letters, digits, _, . and -.`);
const target = path.join(catalogRoot, database);
if (path.resolve(source) === path.resolve(target))
  fail('source and target are the same folder.');

const files = new Set([
  'database.json',
  'relationships.json',
  'business-areas.json',
]);
for (const document of catalog.documents ?? [])
  if (document?.path) files.add(document.path);
for (const table of catalog.tables) {
  if (!table?.detailsPath)
    fail(`table ${table?.id ?? '?'} has no detailsPath.`);
  files.add(table.detailsPath);
}

const guidePath = path.join(target, GUIDE_FILE);
const guide = existsSync(guidePath) ? await readFile(guidePath) : null;
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
if (guide) await writeFile(guidePath, guide);

let copied = 0;
for (const relative of files) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(normalized) || normalized.split(path.sep).includes('..'))
    fail(`refusing to copy ${relative}: path leaves the catalog folder.`);
  if (isSampleData(relative))
    fail(`refusing to copy sample data file ${relative}`);
  const from = path.join(source, normalized);
  if (!existsSync(from)) {
    console.warn(`sync-data: ${relative} missing; skipped.`);
    continue;
  }
  await mkdir(path.dirname(path.join(target, normalized)), { recursive: true });
  await copyFile(from, path.join(target, normalized));
  copied++;
}

const leaked = (await readdir(target, { recursive: true })).filter((f) =>
  isSampleData(String(f)),
);
if (leaked.length)
  fail(`sample data found in the catalog folder: ${leaked.join(', ')}`);

console.log(
  `sync-data: ${catalog.tables.length} tables, ${copied} files -> ${path.relative(projectRoot, target)}`,
);
