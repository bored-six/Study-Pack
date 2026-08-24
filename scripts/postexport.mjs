#!/usr/bin/env node
// Runs after `expo export -p web`, on macOS locally and on Vercel's Linux builders.
//
// Vercel drops any file whose path contains "node_modules", and Expo emits the
// SQLite wasm + Google Fonts under assets/node_modules/. Without this rename the
// app boots to a white screen: no wasm means no database.
import { readdirSync, statSync, renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist');
const from = join(dist, 'assets', 'node_modules');
const to = join(dist, 'assets', 'vendor');

if (existsSync(from)) {
  renameSync(from, to);
  console.log('renamed assets/node_modules -> assets/vendor');
} else if (existsSync(to)) {
  console.log('assets/vendor already present, skipping rename');
} else {
  console.error('ERROR: neither assets/node_modules nor assets/vendor exists in dist/');
  process.exit(1);
}

const REWRITE = new Set(['.js', '.html', '.json']);
let touched = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!REWRITE.has(extname(name))) continue;
    const src = readFileSync(p, 'utf8');
    if (!src.includes('assets/node_modules')) continue;
    writeFileSync(p, src.replaceAll('assets/node_modules', 'assets/vendor'));
    touched++;
  }
};
walk(dist);
console.log(`rewrote asset paths in ${touched} file(s)`);
