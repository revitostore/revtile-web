#!/usr/bin/env node
/* Genera todo lo de la preventa a partir de productos.json (clave `preventa`):
     · una ficha por producto, con sus variantes (sabores), aviso de seguridad,
       tabla nutricional transcrita, FAQ y JSON-LD (Product + FAQPage + Breadcrumb)
     · preventa.html: el índice de la categoría (CollectionPage + ItemList)
     · las tarjetas de la portada (entre los marcadores de index.html)
     · el bloque de preventa de llms.txt y las URLs del sitemap.xml
   Para sumar un producto: agrégalo en productos.json y ejecuta
     node tools/build-preventa.mjs   (y después `node tools/check.mjs`) */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { footer, esc } from './comun.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(ROOT, p), 'utf8');
const escribir = (p, s) => writeFileSync(join(ROOT, p), s, 'utf8');
const data = JSON.parse(leer('productos.json'));
const pre = data.preventa;
const P = pre.productos;
const SITIO = 'https://revtile.com.co/';
const WA = data.whatsapp;
const cop = (n) => '$' + n.toLocaleString('es-CO');
const hash = (p) => createHash('md5').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 8);
const CSS_V = leer('index.html').match(/css\/styles\.css\?v=(\d+)/)[1];
const PRE_CSS_V = hash('css/preventa.css');
const PRE_JS_V = hash('js/preventa.js');

/* ── Utilidades ───────────────────────────────────────────────────── */
const total = (p) => p.variantes.reduce((a, v) => a + v.stock, 0);
const unidades = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;
const nombreLargo = (p) => `${p.marca} ${p.nombre}`;
const abs = (src) => SITIO + (existsSync(join(ROOT, src + '.png')) ? src + '.png' : src + '.jpg');
const jsonLd = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
const sabores = (p) => p.variantes.filter((v) => v.sabor);
const tamano = (p) => {
  const n = sabores(p).length;
  return p.formato.split(' · ')[0] + (n > 1 ? ` · ${n} sabores` : '');
};

/* El mensaje de WhatsApp que se abre al apartar: ya trae el producto y el sabor */
const waUrl = (p, v) => {
  const que = `${nombreLargo(p)} (${p.formato})${v.sabor ? ' — ' + v.sabor : ''}`;
  const msg = v.stock > 0
    ? `Hola REVTILE, quiero apartar en preventa: ${que}. ¿Me avisan el precio cuando llegue?`
    : `Hola REVTILE, vi que se agotó en preventa: ${que}. ¿Me avisan si llegan más unidades?`;
  return `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
};

/* Unidades reales de la tanda, dibujadas como casillas. Nunca se inventa un número. */
const cupos = (n) => n > 0
  ? `<span class="pre-cupos" role="img" aria-label="Quedan ${unidades(n)}"><span class="pre-cupos__sq" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 12))}</span><span class="pre-cupos__txt" aria-hidden="true">Quedan <b>${n}</b></span></span>`
  : `<span class="pre-cupos is-agotado" role="img" aria-label="Agotado"><span class="pre-cupos__sq" aria-hidden="true"><i></i></span><span class="pre-cupos__txt" aria-hidden="true"><b>Agotado</b></span></span>`;

const pic = (base, alt, extra = '') =>
  `<picture><source srcset="${base}.webp" type="image/webp"><img src="${base}.png" alt="${esc(alt)}" width="1000" height="1000"${extra}></picture>`;

const precioLinea = (p, etiqueta = 'Precio de preventa') => p.precio != null
  ? `<p class="pre-precio"><span>${etiqueta}</span><i aria-hidden="true"></i><b>${cop(p.precio)}</b></p>`
  : `<p class="pre-precio"><span>${etiqueta}</span><i aria-hidden="true"></i><b>Al llegar</b></p>`;

/* ── Tarjeta (portada, índice y "otras en preventa") ──────────────── */
function tarjeta(p) {
  const v0 = p.variantes[0];
  const n = total(p);
  return `        <article class="product pre-card reveal">
          <span class="product__flag">Preventa</span>
          <div class="product__photo">${pic(v0.imagen, v0.alt, ' loading="lazy"')}</div>
          <div class="product__info">
            <p class="product__brand">${esc(p.marca)}</p>
            <h3 class="product__name"><a class="product__link" href="${p.pagina}">${esc(p.nombre)}</a></h3>
            <p class="product__size">${esc(tamano(p))}</p>
            <p class="pre-card__gancho">${esc(p.gancho)}</p>
            ${cupos(n)}
            ${precioLinea(p, 'Precio')}
            <a class="btn btn--primary btn--full" href="${p.pagina}">${n > 0 ? 'Apartar' : 'Ver ficha'} <span class="btn__arrow" aria-hidden="true">→</span></a>
          </div>
        </article>`;
}
const grilla = (lista) => `      <div class="products__grid pre__grid">\n${lista.map(tarjeta).join('\n')}\n      </div>`;

/* ── Tabla nutricional (una por sabor; el script de la página muestra la elegida) ── */
const filaNutri = (f) => `<tr><th scope="row">${esc(f[0])}</th><td>${esc(f[1])}</td><td>${esc(f[2])}</td></tr>`;
const grupoNutri = (t) => `<tr class="nutri__grupo"><th colspan="3" scope="colgroup">${esc(t)}</th></tr>`;

function nutricional(p) {
  const bloques = p.variantes.map((v) => {
    const n = Object.assign({}, p.nutricional, v.nutricional);
    const cuerpo = n.grupos
      ? n.grupos.map(([t, fs]) => grupoNutri(t) + fs.map(filaNutri).join('')).join('')
      : (n.grupo ? grupoNutri(n.grupo) : '') + n.filas.map(filaNutri).join('');
    const etiqueta = v.sabor && sabores(p).length > 1
      ? `<p class="pre-var__tag">Sabor ${esc(v.sabor)}</p>` : '';
    return `      <div class="nutri pre-var reveal" data-var="${v.id}">
        <div class="nutri__datos">
          ${etiqueta}
          <table class="spec nutri__tabla">
            <caption>Información por porción</caption>
            <tbody>
              <tr><th scope="row">Tamaño de la porción</th><td>${esc(n.porcion)}</td></tr>
              <tr><th scope="row">Porciones por envase</th><td>${esc(n.porciones)}</td></tr>
            </tbody>
          </table>
          <table class="spec nutri__tabla">
            <thead><tr><th scope="col">Por porción</th><th scope="col">Cantidad</th><th scope="col">Valor diario</th></tr></thead>
            <tbody>
              ${cuerpo}
              <tr><th scope="row">${esc(n.etiqueta_otros || 'Otros ingredientes')}</th><td colspan="2">${esc(n.otros)}</td></tr>
            </tbody>
          </table>
          <ul class="nutri__notas">
            ${(n.notas || []).map((t) => `<li>${esc(t)}</li>`).join('\n            ')}
          </ul>
          <p class="nutri__fuente">${esc(n.fuente || p.nutricional.fuente)}</p>
        </div>
        <figure class="nutri__foto">
          <a href="${n.foto}.jpg" target="_blank" rel="noopener">
            <picture><source srcset="${n.foto}.webp" type="image/webp"><img src="${n.foto}.jpg" alt="Foto de la etiqueta del envase de ${esc(nombreLargo(p))}${v.sabor ? ', sabor ' + esc(v.sabor) : ''}" decoding="async" loading="lazy" width="1000" height="1000"></picture>
          </a>
          <figcaption>La etiqueta del envase. Toca para verla completa.</figcaption>
        </figure>
      </div>`;
  });
  return `
  <section class="pp-section pp-section--alt" id="nutricional">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>03</b> Tabla nutricional</p>
      <h2 class="reveal">Lo que dice el envase<span class="accent">.</span></h2>
${bloques.join('\n')}
    </div>
  </section>`;
}

/* ── JSON-LD ──────────────────────────────────────────────────────── */
function ldProducto(p) {
  const props = p.datos.map(([k, v]) => ({ '@type': 'PropertyValue', name: k, value: v }));
  props.push({ '@type': 'PropertyValue', name: 'Estado', value: 'Preventa (primera tanda)' });
  props.push({ '@type': 'PropertyValue', name: 'Unidades disponibles en la primera tanda', value: String(total(p)) });
  const o = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${nombreLargo(p)}, ${p.formato.replace(' · ', ', ')}`,
    description: p.descripcion,
    url: SITIO + p.pagina,
    image: p.variantes.map((v) => abs(v.imagen)),
    brand: { '@type': 'Brand', name: p.marca },
    category: p.schema_categoria,
    sku: p.sku,
    additionalProperty: props,
  };
  if (sabores(p).length > 1) {
    o.hasVariant = sabores(p).map((v) => ({
      '@type': 'Product',
      name: `${nombreLargo(p)} — ${v.sabor}`,
      sku: `${p.sku}-${v.id}`,
      image: abs(v.imagen),
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Sabor', value: v.sabor },
        { '@type': 'PropertyValue', name: 'Porciones por envase', value: v.porciones },
        { '@type': 'PropertyValue', name: 'Unidades disponibles en la primera tanda', value: String(v.stock) },
      ],
    }));
  }
  /* Sin precio confirmado no se publica oferta: nunca un precio inventado. */
  if (p.precio != null) {
    o.offers = {
      '@type': 'Offer',
      url: SITIO + p.pagina,
      priceCurrency: data.moneda,
      price: String(p.precio),
      availability: total(p) > 0 ? 'https://schema.org/PreOrder' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'REVTILE' },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: data.moneda },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CO' },
      },
    };
  }
  return o;
}
const ldFaq = (faq) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});
const ldMigas = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

/* ── Cabecera y piezas comunes de página ──────────────────────────── */
const cabecera = ({ titulo, meta, canonica, og, ogTipo, preload, ld }) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(meta)}">
  <meta name="theme-color" content="#EDEDE8">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="${SITIO}${canonica}">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(meta)}">
  <meta property="og:type" content="${ogTipo}">
  <meta property="og:url" content="${SITIO}${canonica}">
  <meta property="og:image" content="${og}">
  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/favicon-192.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
${preload ? `  <link rel="preload" as="image" href="${preload}" fetchpriority="high">\n` : ''}  <link rel="stylesheet" href="css/styles.css?v=${CSS_V}">
  <link rel="stylesheet" href="css/preventa.css?v=${PRE_CSS_V}">
  <script>document.documentElement.classList.add('js');</script>
  <script src="js/analytics.js?v=2" defer></script>
${ld.map((o) => `  <script type="application/ld+json">\n${jsonLd(o)}\n  </script>`).join('\n')}
</head>`;

const nav = (volver, href, ctaTxt, ctaHref, ctaAttrs = '') => `  <header class="nav" id="nav">
    <div class="nav__inner">
      <a class="nav__logo" href="index.html">REVTILE<span class="nav__dot">.</span></a>
      <a class="pp-back" href="${href}">${volver}</a>
      <a class="nav__cta" href="${ctaHref}"${ctaAttrs}>${ctaTxt}</a>
    </div>
  </header>`;

const pasos = (lista) => `      <ol class="steps">
${lista.map(([n, t, x]) => `        <li class="step reveal">
          <span class="step__num">${esc(n)}</span>
          <h3 class="step__title">${esc(t)}</h3>
          <p class="step__text">${esc(x)}</p>
        </li>`).join('\n')}
      </ol>`;

const faqHtml = (faq, titulo, num) => `  <section class="faq pp-section--alt">
    <div class="faq__inner">
      <p class="section-eyebrow reveal"><b>${num}</b> Preguntas</p>
      <h2 class="section-title reveal">${titulo}<span class="accent">.</span></h2>
      <div class="faq__list">
${faq.map(([q, a]) => `        <details class="faq__item reveal">
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>
        </details>`).join('\n')}
      </div>
    </div>
  </section>`;

/* ── Ficha de producto ────────────────────────────────────────────── */
function ficha(p) {
  const v0 = p.variantes[0];
  const g0 = v0.galeria;
  const otros = P.filter((o) => o.sku !== p.sku);
  const multi = sabores(p).length > 1;
  const url = SITIO + p.pagina;

  const selector = multi ? `
        <div class="pre-sabores" role="radiogroup" aria-label="Elige el sabor">
          <p class="pre-sabores__lbl">Sabor</p>
          <div class="pre-sabores__fila">
${p.variantes.map((v, i) => `            <button type="button" class="pre-sabor${i === 0 ? ' is-active' : ''}" role="radio" aria-checked="${i === 0}" data-var="${v.id}">
              <span class="pre-sabor__nom">${esc(v.sabor)}</span>
              ${cupos(v.stock)}
            </button>`).join('\n')}
          </div>
        </div>` : '';

  /* Todo lo que cambia al elegir sabor viaja en este JSON; el script solo lo pinta. */
  const preData = {
    variantes: p.variantes.map((v) => ({
      id: v.id,
      sabor: v.sabor,
      cupos: cupos(v.stock),
      wa: waUrl(p, v),
      cta: v.stock > 0 ? 'Apartar mi unidad' : 'Avísame si reponen',
      galeria: v.galeria,
    })),
  };

  const ld = [
    ldProducto(p),
    ldFaq(p.faq),
    ldMigas([['Inicio', SITIO], ['Preventa', SITIO + 'preventa.html'], [nombreLargo(p), url]]),
  ];

  return `${cabecera({
    titulo: p.titulo, meta: p.meta, canonica: p.pagina, og: abs(v0.imagen), ogTipo: 'product',
    preload: g0[0][0] + '.webp', ld,
  })}
<body class="pp">

  <a class="skip-link" href="#ficha">Saltar al contenido</a>

${nav('← Toda la preventa', 'preventa.html', 'Apartar', waUrl(p, v0), ' data-wa target="_blank" rel="noopener"')}

  <main id="ficha">

  <!-- ===== FICHA ===== -->
  <section class="pp-hero">
    <div class="pp-hero__inner">

      <div class="pp-gal">
        <figure class="pp-gal__main">
          <img id="ppMain" width="800" height="800" src="${g0[0][0]}.webp" alt="${esc(g0[0][1])}" fetchpriority="high">
        </figure>
        <div class="pp-gal__thumbs" tabindex="0" role="group" aria-label="Fotos del producto">
${g0.map(([src, alt], i) => `          <button class="pp-gal__thumb${i === 0 ? ' is-active' : ''}" data-src="${src}.webp" data-alt="${esc(alt)}" aria-label="Ver foto ${i + 1}: ${esc(alt)}"><img src="${src}.webp" alt="" loading="lazy"></button>`).join('\n')}
        </div>
        <p class="pre-ref">Fotos de referencia del fabricante. Antes del despacho te enviamos las fotos del sello y el lote de la unidad que recibes.</p>
      </div>

      <div class="pp-buy">
        <p class="pre-tag">Preventa · ${esc(pre.tanda)}</p>
        <p class="product__brand">${esc(p.marca)}</p>
        <h1>${esc(p.nombre)}</h1>
        <p class="product__size">${esc(p.formato)}</p>
${selector}
${multi ? '' : `        <div class="pre-cupos-box" id="preCupos">${cupos(v0.stock)}</div>
`}
        ${precioLinea(p)}
        <a class="pre-alerta pre-alerta--${p.aviso.tipo}" href="#aviso">${esc(p.aviso.titulo)}</a>

        <a class="btn btn--primary btn--full btn--big" id="preCta" data-wa href="${waUrl(p, v0)}" target="_blank" rel="noopener"><span data-wa-txt>${v0.stock > 0 ? 'Apartar mi unidad' : 'Avísame si reponen'}</span> <span class="btn__arrow" aria-hidden="true">→</span></a>
        <p class="pre-promesa">${esc(pre.promesa)}</p>

        <div class="pp-stats">
${p.destacados.map(([b, s]) => `          <div class="pp-stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('\n')}
        </div>
        <p class="pp-note" style="margin-top:4px">${esc(p.resumen)}</p>
      </div>
    </div>
  </section>

  <!-- ===== AVISO ===== -->
  <section class="pp-section" id="aviso">
    <div class="pp-section__inner">
      <aside class="pre-aviso pre-aviso--${p.aviso.tipo} reveal" aria-label="Aviso importante">
        <p class="pre-aviso__tit">${esc(p.aviso.titulo)}</p>
        <ul>
${p.aviso.items.map((t) => `          <li>${esc(t)}</li>`).join('\n')}
        </ul>
      </aside>
    </div>
  </section>

  <!-- ===== LA ETIQUETA Y LA VERIFICACIÓN ===== -->
  <section class="pp-section pp-section--alt">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>01</b> Autenticidad</p>
      <h2 class="reveal">Qué registramos de tu unidad<span class="accent">.</span></h2>
      <div class="pp-cols">
        <div class="reveal">
          <p class="section-lead">Cuando llega la tanda, la unidad que apartaste viene sellada de fábrica. Antes del despacho fotografiamos el sello, el número de lote y la fecha de vencimiento de esa unidad y te enviamos las fotos, para que contrastes los datos con el fabricante.</p>
          <p class="disclaimer">REVTILE documenta lo que puede observarse del producto: el sello, el lote, la fecha y el estado del envase. No somos un laboratorio ni una entidad certificadora, y una inspección visual no reemplaza la verificación con el fabricante. Por eso te damos los datos: para que la verificación la puedas hacer tú.</p>
        </div>
        <div class="reveal">
          <table class="spec">
            <caption>Datos del producto</caption>
            <tbody>
${p.datos.map(([k, v]) => `              <tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== CÓMO USARLO ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>02</b> Cómo usarlo</p>
      <h2 class="reveal">${esc(p.uso.titulo)}<span class="accent">.</span></h2>
${pasos(p.uso.pasos)}
      <p class="disclaimer reveal">Los resultados dependen de tu entrenamiento, tu alimentación, tu descanso y tu constancia. Si tienes alguna condición médica, estás embarazada o en lactancia, o tomas medicamentos, consulta a tu médico antes de consumirlo.</p>
    </div>
  </section>
${nutricional(p)}

  <!-- ===== PREVENTA, ENVÍO Y PAGO ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>04</b> Preventa, envío y pago</p>
      <h2 class="reveal">Cómo funciona<span class="accent">.</span></h2>
      <div class="pp-cols">
        <div class="reveal">
          <table class="spec">
            <caption>La preventa</caption>
            <tbody>
              <tr><th scope="row">Apartar</th><td>Gratis y sin pagar: escríbenos por WhatsApp desde el botón de esta ficha</td></tr>
              <tr><th scope="row">Cuándo llega</th><td>Aún no hay fecha confirmada: te escribimos por WhatsApp apenas llegue la tanda</td></tr>
              <tr><th scope="row">Precio</th><td>Se confirma al llegar; decides si la compras</td></tr>
            </tbody>
          </table>
        </div>
        <div class="reveal">
          <table class="spec">
            <caption>Envío y pago</caption>
            <tbody>
              <tr><th scope="row">Envío</th><td>Gratis a toda Colombia, ${data.envio.dias_habiles} días hábiles, con guía</td></tr>
              <tr><th scope="row">Pago</th><td>Los medios de la tienda: contraentrega, Bre-B, o tarjeta, PSE y Nequi</td></tr>
              <tr><th scope="row">Seguimiento</th><td>Número propio <span class="mono">RV-</span> rastreable en la página</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

${faqHtml(p.faq, `Sobre ${esc(p.nombre)}`, '05')}

  <!-- ===== OTRAS EN PREVENTA ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal">También en preventa</p>
      <div class="products__grid pre__grid" style="margin-top:16px">
${otros.map(tarjeta).join('\n')}
      </div>
    </div>
  </section>

  </main>

${footer(data)}

  <div class="pp-sticky" id="ppSticky" aria-hidden="true">
    <div class="pp-sticky__price">
      <b>Preventa</b>
      <span>${esc(p.marca)} · apártala sin pagar</span>
    </div>
    <a class="btn btn--primary" data-wa href="${waUrl(p, v0)}" target="_blank" rel="noopener" tabindex="-1">Apartar <span class="btn__arrow" aria-hidden="true">→</span></a>
  </div>

  <script type="application/json" id="preData">${jsonLd(preData)}</script>
  <script src="js/product.js?v=3" defer></script>
  <script src="js/preventa.js?v=${PRE_JS_V}" defer></script>
</body>
</html>
`;
}

/* ── Índice de la preventa ────────────────────────────────────────── */
const HUB_FAQ = [
  ['¿Qué es la preventa de REVTILE?', 'Es la primera tanda de suplementos que viene en camino: proteína, pre-entreno, BCAA y un multivitamínico. Puedes apartar tu unidad sin pagar nada y te escribimos por WhatsApp apenas llegue.'],
  ['¿Cuánto cuestan?', 'El precio definitivo de cada uno se confirma cuando llega la tanda. Si apartas, te lo enviamos por WhatsApp y decides si lo compras: apartar no te obliga a nada.'],
  ['¿Cuándo llegan?', 'Todavía no tenemos una fecha confirmada. Te escribimos por WhatsApp apenas lleguen.'],
  ['¿Cómo aparto una unidad?', 'Entra a la ficha del producto, elige el sabor y toca «Apartar»: se abre WhatsApp con tu mensaje listo.'],
  ['¿Cuántas unidades hay?', 'La primera tanda es pequeña y contamos las unidades de cada producto y sabor. El número que ves en cada ficha es el real; cuando se agota, la ficha lo marca como agotado.'],
  ['¿Son originales?', 'Sí. Antes del despacho fotografiamos el sello, el lote y la fecha de vencimiento de tu unidad y te enviamos las fotos. Las fotos de las fichas son de referencia del fabricante.'],
  ['¿Alguno tiene alérgenos o requiere cuidado?', 'Cada ficha trae su aviso. La whey contiene leche y soya; el multivitamínico contiene glucosamina de origen marisco y condroitina bovina; el pre-entreno es de alta estimulación y trae contraindicaciones. Léelos antes de apartar.'],
];

function indice() {
  const hayFamilia = existsSync(join(ROOT, 'assets/pre/familia.png'));
  const titulo = 'Suplementos en preventa: whey, pre-entreno, BCAA y multivitamínico — REVTILE';
  const meta = 'Primera tanda de suplementos originales en preventa en Colombia: Optimum Nutrition Gold Standard Whey, Nutrex Outrage, Rule 1 BCAA y AllMax Vitaform. Apártalos sin pagar. Envío gratis a toda Colombia.';
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Suplementos en preventa — REVTILE', url: SITIO + 'preventa.html', description: meta,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: P.length,
        itemListElement: P.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, url: SITIO + p.pagina, name: `${nombreLargo(p)}, ${p.formato.replace(' · ', ', ')}`, image: abs(p.variantes[0].imagen),
        })),
      },
    },
    ldFaq(HUB_FAQ),
    ldMigas([['Inicio', SITIO], ['Preventa', SITIO + 'preventa.html']]),
  ];
  return `${cabecera({
    titulo, meta, canonica: 'preventa.html',
    og: hayFamilia ? SITIO + 'assets/pre/familia.png' : abs(P[0].variantes[0].imagen), ogTipo: 'website',
    preload: hayFamilia ? 'assets/pre/familia.webp' : '', ld,
  })}
<body class="pp">

  <a class="skip-link" href="#ficha">Saltar al contenido</a>

${nav('← Volver a la tienda', 'index.html#productos', 'WhatsApp', `https://wa.me/${WA}?text=${encodeURIComponent('Hola REVTILE, quiero apartar algo de la preventa')}`, ' target="_blank" rel="noopener"')}

  <main id="ficha">

  <section class="pp-section pre-hub">
    <div class="pp-section__inner pre-hub__grid">
      <div class="pre-hub__txt">
        <p class="pre-tag">Preventa · ${esc(pre.tanda)}</p>
        <h1>Suplementos en preventa<span class="accent">.</span></h1>
        <p class="section-lead">Proteína, pre-entreno, BCAA y multivitamínico de marcas originales. Cada unidad está contada: el número que ves en cada ficha es el real.</p>
        <p class="pre-promesa">${esc(pre.promesa)}</p>
      </div>
${hayFamilia ? `      <div class="pre-hub__img"><picture><source srcset="assets/pre/familia.webp" type="image/webp"><img src="assets/pre/familia.png" alt="Los cuatro suplementos en preventa de REVTILE: Gold Standard Whey, Nutrex Outrage, Rule 1 BCAA y AllMax Vitaform" width="1800" height="900" fetchpriority="high"></picture></div>` : ''}
    </div>
  </section>

  <section class="pp-section pp-section--alt">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>01</b> La primera tanda</p>
${grilla(P)}
    </div>
  </section>

  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>02</b> Cómo funciona</p>
      <h2 class="reveal">Tres pasos, ninguno con pago<span class="accent">.</span></h2>
${pasos([
  ['01', 'Aparta tu unidad', 'Entra a la ficha, elige el sabor y toca «Apartar». Se abre WhatsApp con tu mensaje listo. No pagas nada.'],
  ['02', 'Te avisamos al llegar', 'Cuando llega la tanda te escribimos con el precio definitivo. Decides si la compras.'],
  ['03', 'Verificas y recibes', 'Antes del despacho te enviamos las fotos del sello y el lote de tu unidad. Envío gratis a toda Colombia.'],
])}
    </div>
  </section>

${faqHtml(HUB_FAQ, 'Preguntas sobre la preventa', '03')}

  </main>

${footer(data)}

  <script src="js/product.js?v=3" defer></script>
</body>
</html>
`;
}

/* ── Escritura de páginas ─────────────────────────────────────────── */
for (const p of P) { escribir(p.pagina, ficha(p)); console.log('  escrita  ' + p.pagina); }
escribir('preventa.html', indice()); console.log('  escrita  preventa.html');

/* ── Portada: tarjetas entre marcadores ───────────────────────────── */
const INI = '<!-- preventa:tarjetas:inicio -->';
const FIN = '<!-- preventa:tarjetas:fin -->';
let index = leer('index.html');
if (index.includes(INI) && index.includes(FIN)) {
  index = index.replace(new RegExp(`${INI}[\\s\\S]*?${FIN}`), `${INI}\n${grilla(P)}\n      ${FIN}`);
  index = index.replace(/css\/preventa\.css\?v=\w+/g, `css/preventa.css?v=${PRE_CSS_V}`);
  escribir('index.html', index);
  console.log('  portada  tarjetas de preventa al día');
} else console.log('  AVISO    index.html no tiene los marcadores de preventa');

/* ── llms.txt: bloque de preventa ─────────────────────────────────── */
const bloqueLlms = `## Preventa (primera tanda de suplementos)
Estado: preventa. Apartar es gratis y sin pagar; el precio definitivo se confirma cuando llega la tanda. Las unidades están contadas y el número de cada ficha es el real. Envío gratis a toda Colombia. Todos los productos se verifican con fotos del sello y el lote antes del despacho.
- [Índice de la preventa](${SITIO}preventa.html): los cuatro suplementos, con unidades disponibles
${P.map((p) => {
  const sab = sabores(p).map((v) => `${v.sabor} (${v.stock})`).join(', ');
  return `- [${nombreLargo(p)}, ${p.formato.replace(' · ', ', ')}](${SITIO}${p.pagina}): ${p.gancho}${sab ? ` Sabores y unidades: ${sab}.` : ` Unidades: ${total(p)}.`} ${p.aviso.titulo}.`;
}).join('\n')}
`;
let llms = leer('llms.txt');
if (/## Preventa[\s\S]*?(?=\n## )/.test(llms)) llms = llms.replace(/## Preventa[\s\S]*?(?=\n## )/, bloqueLlms.trimEnd() + '\n');
else llms = llms.replace('## Paginas clave', bloqueLlms + '\n## Paginas clave');
escribir('llms.txt', llms);
console.log('  llms.txt bloque de preventa al día');

/* ── sitemap.xml ──────────────────────────────────────────────────── */
const urlsMapa = [['preventa.html', '0.8'], ...P.map((p) => [p.pagina, '0.7'])]
  .map(([u, pr]) => `  <url>\n    <loc>${SITIO}${u}</loc>\n    <priority>${pr}</priority>\n  </url>`).join('\n');
let mapa = leer('sitemap.xml');
const MI = '<!-- preventa:inicio -->', MF = '<!-- preventa:fin -->';
if (mapa.includes(MI)) mapa = mapa.replace(new RegExp(`${MI}[\\s\\S]*?${MF}`), `${MI}\n${urlsMapa}\n  ${MF}`);
else mapa = mapa.replace('</urlset>', `  ${MI}\n${urlsMapa}\n  ${MF}\n</urlset>`);
escribir('sitemap.xml', mapa);
console.log('  sitemap  URLs de preventa al día');

console.log(`\nPreventa generada: ${P.length} fichas + índice. Unidades en total: ${P.reduce((a, p) => a + total(p), 0)}.`);
