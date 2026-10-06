#!/usr/bin/env node
/* Verifica que los precios digan lo mismo en todas partes.
   Uso:  node tools/check.mjs
   Falla (exit 1) si productos.json, checkout.js, las tarjetas del index,
   las fichas o el JSON-LD se contradicen. */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const data = JSON.parse(read('productos.json'));
const cop = (n) => '$' + n.toLocaleString('es-CO');

const errores = [];
const avisos = [];

/* 1 · checkout.js debe usar los mismos precios */
const checkout = read('js/checkout.js');
for (const p of data.productos) {
  const re = new RegExp(`${p.sku}\\s*:\\s*\\{[^}]*precio:\\s*(\\d+)`);
  const m = checkout.match(re);
  if (!m) errores.push(`checkout.js no define el producto "${p.sku}"`);
  else if (Number(m[1]) !== p.precio)
    errores.push(`checkout.js dice ${cop(Number(m[1]))} para "${p.sku}", productos.json dice ${cop(p.precio)}`);
}
const envioConst = checkout.match(/const ENVIO\s*=\s*(\d+)/);
if (!envioConst) errores.push('checkout.js no define ENVIO');
else if (Number(envioConst[1]) !== data.envio.costo)
  errores.push(`El envío no coincide: checkout.js ${envioConst[1]} vs productos.json ${data.envio.costo}`);

/* 2 · el precio de cada producto debe aparecer en su ficha, y el JSON-LD coincidir */
for (const p of data.productos) {
  let html;
  try { html = read(p.pagina); } catch { errores.push(`Falta la ficha ${p.pagina}`); continue; }
  if (!html.includes(cop(p.precio)))
    errores.push(`${p.pagina} no muestra el precio ${cop(p.precio)}`);
  const ld = html.match(/"price"\s*:\s*"?(\d+)"?/);
  if (!ld) avisos.push(`${p.pagina} no tiene precio en el JSON-LD`);
  else if (Number(ld[1]) !== p.precio)
    errores.push(`${p.pagina}: el JSON-LD dice ${cop(Number(ld[1]))} y la página ${cop(p.precio)}`);
}

/* 3 · ninguna página puede prometer envío gratis a todo el país:
      es gratis en Bogotá y cuesta $5.000 al resto */
for (const f of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const s = read(f);
  if (/\$\s?5\.000[^.<]{0,44}env[ií]o/i.test(s) || /env[ií]o[^.<]{0,44}\$\s?5\.000/i.test(s))
    errores.push(`${f} sigue cobrando $5.000 de envío; ahora es gratis a ${data.envio.gratis}`);
}

/* 4 · nada de urgencia simulada */
for (const f of readdirSync(join(ROOT, 'js'))) {
  const s = read(join('js', f));
  const random = s.replace(/Math\.random\(\)\.toString\(36\)/g, '');
  if (/Math\.random\(\)[\s\S]{0,300}(pidieron|personas|comprando|quedan\s+\d|en stock|cupos)/i.test(random))
    errores.push(`js/${f} parece generar actividad simulada con Math.random()`);
}

/* 5 · avisos sobre datos pendientes */
for (const [k, v] of Object.entries(data._pendientes || {}))
  if (!v) avisos.push(`Pendiente de completar: ${k}`);
for (const p of data.productos)
  if (p.precio_antes && !p.precio_antes_confirmado)
    avisos.push(`"${p.sku}": el precio tachado ${cop(p.precio_antes)} está sin confirmar como precio realmente cobrado`);

/* 6 · preventa: stock real, sin precio inventado, avisos de seguridad y SEO al día */
const pv = (data.preventa && data.preventa.productos) || [];
const llms = read('llms.txt');
const mapa = read('sitemap.xml');
const portada = read('index.html');
const existe = (p) => { try { readFileSync(join(ROOT, p)); return true; } catch { return false; } };
for (const p of pv) {
  let html;
  try { html = read(p.pagina); } catch { errores.push(`Falta la ficha de preventa ${p.pagina}`); continue; }
  const ldBloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const b of ldBloques) { try { JSON.parse(b[1]); } catch { errores.push(`${p.pagina}: un bloque JSON-LD no es JSON válido`); } }
  if (p.precio == null && /"price"\s*:/.test(html))
    errores.push(`${p.pagina}: tiene "price" en el JSON-LD pero el precio no está confirmado (precio: null)`);
  if (p.precio != null && !html.includes(cop(p.precio)))
    errores.push(`${p.pagina} no muestra el precio ${cop(p.precio)}`);
  if (!p.aviso || !p.aviso.items || !p.aviso.items.length)
    errores.push(`${p.sku}: una ficha de suplemento necesita su aviso de seguridad`);
  for (const v of p.variantes) {
    if (!Number.isInteger(v.stock) || v.stock < 0) errores.push(`${p.sku}/${v.id}: el stock debe ser un entero >= 0`);
    const marca = v.stock > 0 ? `Quedan ${v.stock} ${v.stock === 1 ? 'unidad' : 'unidades'}` : 'aria-label="Agotado"';
    if (!html.includes(marca)) errores.push(`${p.pagina}: no muestra el stock real de "${v.sabor || v.id}" (${v.stock})`);
    for (const [src] of v.galeria) if (!existe(src + '.webp')) errores.push(`${p.sku}/${v.id}: falta la imagen ${src}.webp`);
    if (!existe(v.imagen + '.png')) errores.push(`${p.sku}/${v.id}: falta ${v.imagen}.png`);
  }
  if (!llms.includes(p.pagina)) errores.push(`llms.txt no menciona ${p.pagina}`);
  if (!mapa.includes(p.pagina)) errores.push(`sitemap.xml no incluye ${p.pagina}`);
  if (!portada.includes(p.pagina)) errores.push(`index.html no enlaza ${p.pagina}`);
}
if (pv.length && !mapa.includes('preventa.html')) errores.push('sitemap.xml no incluye preventa.html');

/* 7 · la maleta: catálogo del navegador, catálogo del servidor y páginas que los cargan */
{
  const cat = read('js/catalogo.js');
  const srv = read('functions/api/_catalogo.js');
  const claves = [
    ...data.productos.map((p) => `${p.sku}:u`),
    ...pv.flatMap((p) => p.variantes.map((v) => `${p.sku}:${v.id}`)),
  ];
  for (const k of claves) {
    if (!cat.includes(`"k":"${k}"`)) errores.push(`js/catalogo.js no tiene ${k} (ejecuta node tools/build-preventa.mjs)`);
    if (!existe((data.bolsa || {})[k] ? data.bolsa[k].img.replace(/\.webp$/, '') + '.webp' : 'no-existe'))
      errores.push(`Falta la imagen de la maleta de ${k} (productos.json → bolsa)`);
  }
  for (const p of pv) for (const v of p.variantes) {
    const m = srv.match(new RegExp(`"${p.sku}:${v.id}": \\{\\s*"stock": (\\d+)`));
    if (!m) errores.push(`functions/api/_catalogo.js no tiene ${p.sku}:${v.id}`);
    else if (Number(m[1]) !== v.stock) errores.push(`El stock del servidor de ${p.sku}:${v.id} (${m[1]}) no coincide con productos.json (${v.stock}); ejecuta node tools/build-preventa.mjs`);
  }
  for (const f of ['index.html', 'pedido.html', ...data.productos.map((p) => p.pagina), ...pv.map((p) => p.pagina), 'preventa.html']) {
    const h = read(f);
    if (!h.includes('js/maleta.js') || !h.includes('js/catalogo.js')) errores.push(`${f} no carga la maleta (js/catalogo.js y js/maleta.js)`);
  }
  if (!read('pedido.html').includes('data-maleta-estante')) errores.push('pedido.html perdió el estante de la maleta');
  if (!read('pedido.html').includes('js/scoop.js')) errores.push('pedido.html no carga el juego del scoop');
}

for (const a of avisos) console.log('  aviso   ' + a);
for (const e of errores) console.error('  ERROR   ' + e);
console.log(errores.length ? `\n${errores.length} error(es).` : '\nTodo coherente.');
process.exit(errores.length ? 1 : 0);
