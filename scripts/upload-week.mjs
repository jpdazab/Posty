#!/usr/bin/env node
// Sube una semana de propuestas a la cuenta de Posty de un usuario, usando su token de rutina.
//
//   POSTY_URL=https://tu-posty.vercel.app POSTY_TOKEN=posty_xxx node scripts/upload-week.mjs propuestas/2026-W42.md
//
// Envía el Markdown y después cada imagen/PDF de la carpeta con el mismo nombre (propuestas/2026-W42/).

import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const [mdPath] = process.argv.slice(2);
const base = (process.env.POSTY_URL || '').replace(/\/$/, '');
const token = process.env.POSTY_TOKEN;

if (!mdPath || !base || !token) {
  console.error('Uso: POSTY_URL=https://… POSTY_TOKEN=posty_… node scripts/upload-week.mjs propuestas/AAAA-Www.md');
  process.exit(1);
}

const week = basename(mdPath, '.md');
const endpoint = `${base}/api/proposals`;

async function send(url, body, contentType) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      if (res.status < 500 || attempt === 2) throw new Error(`${res.status}: ${json.error || res.statusText}`);
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

async function main() {
  const result = await send(`${endpoint}?week=${encodeURIComponent(week)}`, await readFile(mdPath), 'text/markdown; charset=utf-8');
  console.log(`✓ ${week}: ${result.posts} posts`);

  const folder = join(dirname(mdPath), week);
  const present = await readdir(folder).catch(() => []);
  const missing = (result.expectedFiles || []).filter((f) => !present.includes(f));
  for (const file of present.filter((f) => /\.(png|jpe?g|webp|gif|pdf)$/i.test(f))) {
    await send(`${endpoint}?week=${encodeURIComponent(week)}&file=${encodeURIComponent(file)}`, await readFile(join(folder, file)), 'application/octet-stream');
    console.log(`  ✓ ${file}`);
  }
  if (missing.length) console.warn(`  ⚠ El Markdown nombra archivos que no están en ${folder}: ${missing.join(', ')}`);
}

main().catch((err) => {
  console.error(`✗ No se pudo subir ${week}: ${err.message}`);
  process.exit(1);
});
