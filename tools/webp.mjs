#!/usr/bin/env node
/* Envuelve cada <img src="assets/…"> en un <picture> con su versión WebP,
   dejando el original como respaldo. Es idempotente: si la imagen ya está
   dentro de un <picture>, la deja como está.

   Uso:  node tools/webp.mjs            (después de tools/build-fichas.mjs)
   Las .webp las genera tools/webp-convert.sh */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* estas no se convierten: los favicons los pide el sistema operativo y la
   tarjeta de redes sociales tiene que ser JPG para que la lean todas */
const EXCLUIR = /favicon|apple-touch|og-card/;

let total = 0;

for (const archivo of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const ruta = join(ROOT, archivo);
  let html = readFileSync(ruta, 'utf8');
  let n = 0;

  html = html.replace(/<img\b[^>]*>/g, (tag, i) => {
    const m = tag.match(/src="((assets\/[^"]+)\.(png|jpe?g))"/);
    if (!m || EXCLUIR.test(m[1])) return tag;

    const webp = m[2] + '.webp';
    if (!existsSync(join(ROOT, webp))) return tag;

    /* ¿ya está dentro de un <picture>? */
    const antes = html.slice(Math.max(0, i - 400), i);
    const abre = antes.lastIndexOf('<picture');
    if (abre !== -1 && antes.indexOf('</picture>', abre) === -1) return tag;

    n++;
    /* el <source> lleva el mismo id + "-webp" cuando la imagen tiene id,
       para que el JS que cambia la foto pueda actualizar los dos */
    const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
    const idSource = id ? ` id="${id}-webp"` : '';
    return `<picture><source${idSource} srcset="${webp}" type="image/webp">${tag}</picture>`;
  });

  /* los preload apuntan a la versión que el navegador va a usar de verdad */
  html = html.replace(
    /<link rel="preload" as="image" href="(assets\/[^"]+)\.(png|jpe?g)"([^>]*)>/g,
    (tag, base, ext, resto) =>
      existsSync(join(ROOT, base + '.webp'))
        ? `<link rel="preload" as="image" href="${base}.webp" type="image/webp"${resto}>`
        : tag
  );

  if (n) { writeFileSync(ruta, html, 'utf8'); console.log(`  ${archivo}: ${n} imágenes con WebP`); total += n; }
}

console.log(`\n${total} imágenes servidas como WebP con respaldo.`);
