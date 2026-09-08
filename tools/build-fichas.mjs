#!/usr/bin/env node

/* Un dato legal que no existe no se anuncia: la fila simplemente no
   se pinta. Nunca se escribe un valor inventado ni la palabra
   "Pendiente", que en produccion se lee como un error. */

/* La tabla nutricional se escribe como tabla, no como imagen: se lee con
   lector de pantalla, se copia, la indexa Google y no obliga a hacer
   zoom en el celular. La foto del envase queda al lado, para que
   cualquiera compruebe que la transcripcion es fiel. */
const nutricional = (p) => {
  const n = p.nutricional;
  if (!n) return '';
  return `
  <section class="pp-section pp-section--alt" id="nutricional">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>·</b> Tabla nutricional</p>
      <h2 class="reveal">Lo que dice el envase<span class="accent">.</span></h2>
      <div class="nutri reveal">
        <div class="nutri__datos">
          <table class="spec nutri__tabla">
            <caption>Información nutricional por porción</caption>
            <tbody>
              <tr><th scope="row">Tamaño de la porción</th><td>${n.porcion}</td></tr>
              <tr><th scope="row">Porciones por envase</th><td>${n.porciones}</td></tr>
            </tbody>
          </table>
          <table class="spec nutri__tabla">
            <thead>
              <tr><th scope="col">Por porción</th><th scope="col">Cantidad</th><th scope="col">Valor diario</th></tr>
            </thead>
            <tbody>
              ${n.filas.map(f => `<tr><th scope="row">${f[0]}</th><td>${f[1]}</td><td>${f[2]}</td></tr>`).join('\n              ')}
              <tr><th scope="row">Otros ingredientes</th><td colspan="2">${n.otros}</td></tr>
            </tbody>
          </table>
          <ul class="nutri__notas">
            ${n.notas.map(t => `<li>${t}</li>`).join('\n            ')}
          </ul>
          <p class="nutri__fuente">${n.fuente}</p>
        </div>
        <figure class="nutri__foto">
          <a href="${n.foto}.jpg" target="_blank" rel="noopener">
            <picture><source srcset="${n.foto}.webp" type="image/webp"><img src="${n.foto}.jpg" alt="Foto de la tabla nutricional impresa en el envase de ${p.marca} ${p.nombre}" decoding="async" width="${n.ancho || 1000}" height="${n.alto || 1000}"></picture>
          </a>
          <figcaption>La etiqueta del envase. Toca para verla completa.</figcaption>
        </figure>
      </div>
    </div>
  </section>`;
};

const fila = (k, v) => v ? `<div><span class="k">${k}</span><span class="v">${v}</span></div>` : '';
/* Genera las tres fichas de producto desde productos.json + el contenido de
   abajo, para que el precio viva en un solo sitio y las tres páginas no se
   desincronicen nunca.
   Uso:  node tools/build-fichas.mjs   (y después `node tools/check.mjs`) */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'productos.json'), 'utf8'));
const cop = (n) => '$' + n.toLocaleString('es-CO');
const WA = data.whatsapp;

/* ── Contenido propio de cada ficha ───────────────────────────────── */
const CONTENIDO = {
  on: {
    titulo: 'Optimum Nutrition Micronized Creatine 300 g — REVTILE',
    resumen: 'La presentación con la que casi todo el mundo empieza: dos meses de toma diaria, de la marca de creatina más vendida del mundo.',
    galeria: [
      ['assets/on.png', 'Tarro de Optimum Nutrition Micronized Creatine Powder de 300 g'],
      ['assets/tablas/tabla-on.jpg', 'Tabla nutricional impresa en el envase de 300 g'],
      ['assets/galeria/sello-on.jpg', 'Sello interno de fábrica de Optimum Nutrition intacto'],
      ['assets/galeria/detalle-1.jpg', 'Lote y fecha de vencimiento impresos por el fabricante en la base del tarro'],
      ['assets/galeria/polvo-on.jpg', 'Polvo de creatina micronizada, fino y blanco'],
      ['assets/galeria/mezcla-on.jpg', 'Creatina disolviéndose en un vaso de agua'],
      ['assets/galeria/detalle-2.jpg', 'Interior de la tapa del envase original, Made in USA'],
    ],
    datos: [
      ['Contenido neto', '300 g'],
      ['Servicios', '60 servicios de 5 g'],
      ['Ingrediente', 'Monohidrato de creatina micronizada'],
      ['Sabor', 'Sin sabor'],
      ['Presentación', 'Polvo'],
      ['Origen', 'Made in USA'],
      ['Sello de seguridad', 'Banda exterior + sello interno de aluminio'],
    ],
    verificacion: 'El tarro llega con la banda exterior y el sello interno de aluminio sin abrir. En la base del envase están impresos el lote y la fecha de vencimiento, que fotografiamos antes de despachar.',
  },
  mt: {
    titulo: 'MuscleTech Platinum Creatine Monohydrate 400 g — REVTILE',
    resumen: 'Cien gramos más que la presentación de entrada y el único de nuestros tarros con sello de autenticidad QR del propio fabricante.',
    galeria: [
      ['assets/muscletech.png', 'Tarro de MuscleTech Platinum Creatine Monohydrate de 400 g'],
      ['assets/tablas/tabla-mt.jpg', 'Tabla nutricional impresa en el envase de MuscleTech'],
      ['assets/galeria/sello-muscletech.jpg', 'Sello de autenticidad de MuscleTech con código QR verificable'],
      ['assets/galeria/tarro-muscletech.jpg', 'Tarro de MuscleTech Platinum Creatine sellado de fábrica'],
    ],
    datos: [
      ['Contenido neto', '400 g'],
      ['Servicios', '80 servicios de 5 g'],
      ['Ingrediente', 'Monohidrato de creatina micronizada'],
      ['Sabor', 'Sin sabor'],
      ['Presentación', 'Polvo'],
      ['Sello de seguridad', 'Banda exterior + sello interno + sello QR de autenticidad'],
    ],
    verificacion: 'Además del sello de fábrica, MuscleTech incluye un sello de autenticidad con código QR que puedes escanear tú mismo y verificar en el sitio oficial de la marca. Es la verificación más directa de las tres presentaciones.',
  },
  on120: {
    titulo: 'Optimum Nutrition Micronized Creatine 600 g (120 servicios) — REVTILE',
    resumen: 'El tarro grande: unos cuatro meses de toma diaria y el precio por servicio más bajo de la tienda.',
    galeria: [
      ['assets/on120.png', 'Tarro de Optimum Nutrition Micronized Creatine Powder de 600 g'],
      ['assets/tablas/tabla-on120.jpg', 'Tabla nutricional impresa en el envase de 600 g'],
      ['assets/galeria/on120-tarro.jpg', 'Tarro de 600 g sellado de fábrica'],
      ['assets/galeria/on120-sello.jpg', 'Sello interno de aluminio intacto del tarro de 600 g'],
      ['assets/galeria/on120-lote.jpg', 'Lote y fecha de vencimiento impresos en la base del tarro de 600 g'],
      ['assets/galeria/on120-destape.jpg', 'Tarro de 600 g destapado mostrando el sello de seguridad'],
      ['assets/galeria/polvo-on.jpg', 'Polvo de creatina micronizada, fino y blanco'],
    ],
    datos: [
      ['Contenido neto', '600 g'],
      ['Servicios', '120 servicios de 5 g'],
      ['Ingrediente', 'Monohidrato de creatina micronizada'],
      ['Sabor', 'Sin sabor'],
      ['Presentación', 'Polvo'],
      ['Origen', 'Made in USA'],
      ['Sello de seguridad', 'Banda exterior + sello interno de aluminio'],
    ],
    verificacion: 'El mismo producto que la presentación de 300 g, en el doble de contenido. Sello exterior e interno intactos, y lote y vencimiento impresos por el fabricante en la base.',
  },
};

const SOCIALES = `        <div class="footer__social-row">
          <a class="social__link" href="https://www.instagram.com/revtile.store" target="_blank" rel="noopener" aria-label="Instagram de REVTILE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none"/></svg>
          </a>
          <a class="social__link" href="https://www.tiktok.com/@revtilestore" target="_blank" rel="noopener" aria-label="TikTok de REVTILE">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.7 2h-3.2v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.5a6.2 6.2 0 0 0-.9-.1 6.2 6.2 0 1 0 6.2 6.2V8.6a7.6 7.6 0 0 0 4.4 1.4V6.8A4.5 4.5 0 0 1 16.7 2z"/></svg>
          </a>
          <a class="social__link" href="https://www.facebook.com/share/1CMiGgR6jj/?mibextid=wwXIfr" target="_blank" rel="noopener" aria-label="Facebook de REVTILE">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7h2.4l.4-2.9h-2.8V9.2c0-.8.3-1.4 1.5-1.4h1.4V5.2c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.2H8v2.9h2.5v7h3z"/></svg>
          </a>
        </div>`;

const footer = () => `  <footer class="footer">
    <div class="footer__grid">
      <div class="footer__brand">
        <p class="footer__logo">REVTILE<span class="nav__dot">.</span></p>
        <p class="footer__tag">Creatina original, sellada de fábrica y con lote verificable. Pedido en línea, confirmación por WhatsApp, envío gratis a toda Colombia.</p>
${SOCIALES}
      </div>
      <nav class="footer__col" aria-label="Tienda">
        <p class="footer__title">Tienda</p>
        <a href="index.html#productos">Catálogo</a>
${data.productos.map((p) => `        <a href="${p.pagina}">${p.marca === 'MuscleTech' ? 'MT' : 'ON'} ${p.gramos} g</a>`).join('\n')}
        <a href="pedido.html">Hacer mi pedido</a>
      </nav>
      <nav class="footer__col" aria-label="Ayuda">
        <p class="footer__title">Ayuda</p>
        <a href="index.html#faq">Preguntas frecuentes</a>
        <a href="rastreo.html">Rastrear mi pedido</a>
        <a href="guia-creatina-original.html">¿Es original? Guía con fotos</a>
        <a href="on-vs-muscletech.html">ON o MuscleTech</a>
      </nav>
      <div class="footer__col" aria-label="Contacto">
        <p class="footer__title">Contacto</p>
        <a href="https://wa.me/${WA}" target="_blank" rel="noopener">WhatsApp +57 321 456 9600</a>
        <a href="mailto:contacto@revtile.com.co">contacto@revtile.com.co</a>
        <span>Bogotá · Colombia</span>
        <a href="terminos.html">Términos, envíos y privacidad</a>
      </div>
    </div>
    <div class="footer__legal">
      <div><span class="k">Nombre comercial</span><span class="v">REVTILE</span></div>
      ${fila('Razón social', data._pendientes.razon_social)}
      ${fila('NIT', data._pendientes.nit)}
      ${fila('Dirección de notificación', data._pendientes.direccion_notificacion)}
    </div>
    <div class="footer__base">
      <p>© 2026 REVTILE · Creatina original, sellada y verificable</p>
      <p class="footer__note">Los suplementos no son medicamentos y no sustituyen una alimentación equilibrada. Si tienes una condición médica, consulta a tu médico. REVTILE documenta el estado observable de cada producto antes del despacho; no es un laboratorio ni una entidad certificadora.</p>
    </div>
  </footer>`;

/* ── Plantilla ────────────────────────────────────────────────────── */
function ficha(p) {
  const c = CONTENIDO[p.sku];
  const otros = data.productos.filter((o) => o.sku !== p.sku);
  const porServicio = Math.round(p.precio / p.servicios);
  const dias = p.gramos / p.gramos_por_servicio;
  const meses = Math.round(dias / 30);
  const nombreCompleto = `${p.marca} ${p.nombre} ${p.gramos} g`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.titulo}</title>
  <meta name="description" content="${nombreCompleto}, ${p.servicios} servicios de ${p.gramos_por_servicio} g. ${cop(p.precio)} COP, ${cop(porServicio)} por servicio. Sellada de fábrica, con lote y vencimiento verificables. ${data.envio.frase_corta}.">
  <meta name="theme-color" content="#EDEDE8">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="https://revtile.com.co/${p.pagina}">
  <meta property="og:title" content="${nombreCompleto} — REVTILE">
  <meta property="og:description" content="${p.servicios} servicios por ${cop(p.precio)} — ${cop(porServicio)} por servicio. Sellada de fábrica y con lote verificable.">
  <meta property="og:type" content="product">
  <meta property="og:url" content="https://revtile.com.co/${p.pagina}">
  <meta property="og:image" content="https://revtile.com.co/${p.imagen}">
  <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/favicon-192.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="preload" as="image" href="${p.imagen}" fetchpriority="high">
  <link rel="stylesheet" href="css/styles.css?v=65">
  <script>document.documentElement.classList.add('js');</script>
  <script src="js/analytics.js?v=2" defer></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "${p.marca} ${p.nombre} ${p.gramos} g (${p.servicios} servicios)",
    "image": "https://revtile.com.co/${p.imagen}",
    "description": "Creatina monohidratada micronizada sellada de fábrica, presentación de ${p.gramos} g con ${p.servicios} servicios de ${p.gramos_por_servicio} g.",
    "brand": { "@type": "Brand", "name": "${p.marca}" },
    "offers": {
      "@type": "Offer",
      "url": "https://revtile.com.co/${p.pagina}",
      "priceCurrency": "${data.moneda}",
      "price": "${p.precio}",
      "availability": "https://schema.org/InStock",
      "seller": { "@type": "Organization", "name": "REVTILE" },
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "${data.moneda}" },
        "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "CO" }
      }
    }
  }
  </script>
</head>
<body class="pp">

  <a class="skip-link" href="#ficha">Saltar al contenido</a>

  <header class="nav" id="nav">
    <div class="nav__inner">
      <a class="nav__logo" href="index.html">REVTILE<span class="nav__dot">.</span></a>
      <a class="pp-back" href="index.html#productos">← Todas las creatinas</a>
      <a class="nav__cta" href="pedido.html?producto=${p.sku}">Pedir</a>
    </div>
  </header>

  <main id="ficha">

  <!-- ===== FICHA ===== -->
  <section class="pp-hero">
    <div class="pp-hero__inner">

      <!-- Galería -->
      <div class="pp-gal">
        <figure class="pp-gal__main">
          <img id="ppMain" width="800" height="800" src="${c.galeria[0][0]}" alt="${c.galeria[0][1]}" fetchpriority="high">
        </figure>
        <div class="pp-gal__thumbs" tabindex="0" role="group" aria-label="Fotos del producto">
${c.galeria.map(([src, alt], i) => `          <button class="pp-gal__thumb${i === 0 ? ' is-active' : ''}" data-src="${src}" data-alt="${alt}" aria-label="Ver foto ${i + 1}: ${alt}"><img src="${src}" alt="" loading="lazy"></button>`).join('\n')}
        </div>
      </div>

      <!-- Decisión -->
      <div class="pp-buy">
        <p class="product__brand">${p.marca}</p>
        <h1>${p.nombre}</h1>
        <p class="product__size">${p.gramos} g · ${p.servicios} servicios de ${p.gramos_por_servicio} g</p>

        <div class="pp-buy__price">
          <span class="now">${cop(p.precio)}</span>
          ${p.precio_antes ? `<span class="was">${cop(p.precio_antes)}</span>` : ''}
        </div>
        <p class="pp-buy__unit"><b>${cop(porServicio)}</b> por servicio · te dura <b>${dias} días</b> tomando ${p.gramos_por_servicio} g al día</p>
        <span class="sello">Envío gratis a toda Colombia</span>

        <ul class="checks" style="margin-block:8px">
          <li class="check">Sellada de fábrica</li>
          <li class="check">Lote y vencimiento verificables</li>
          <li class="check">Fotos de tu tarro antes del despacho</li>
          <li class="check">Envío gratis a toda Colombia</li>
        </ul>

        <a class="btn btn--primary btn--full btn--big" href="pedido.html?producto=${p.sku}">Pedir esta creatina <span class="btn__arrow" aria-hidden="true">→</span></a>
        <p class="pp-note">Armas el pedido aquí y lo confirmas por WhatsApp. Contraentrega disponible en todo el país.</p>

        <div class="pp-stats">
          <div class="pp-stat"><b>${p.gramos} g</b><span>Contenido</span></div>
          <div class="pp-stat"><b>${p.servicios}</b><span>Servicios</span></div>
          <div class="pp-stat"><b>${p.gramos_por_servicio} g</b><span>Por servicio</span></div>
          <div class="pp-stat"><b>~${meses}</b><span>Meses</span></div>
        </div>

        <p class="pp-note" style="margin-top:4px">${c.resumen}</p>
      </div>
    </div>
  </section>

  <!-- ===== ELEGIR PRESENTACIÓN ===== -->
  <section class="pp-section pp-section--alt">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>01</b> Presentación</p>
      <h2 class="reveal">Es la misma creatina.<br>Cambia cuánto te dura<span class="accent">.</span></h2>
      <div class="picker reveal">
${data.productos.map((o) => `        <a class="picker__opt${o.sku === p.sku ? ' is-active' : ''}" href="${o.pagina}"${o.sku === p.sku ? ' aria-current="page"' : ''}>
          <span class="picker__role">${o.rol}</span>
          <span class="picker__size">${o.gramos} g · ${o.servicios} servicios</span>
          <span class="picker__price">${cop(o.precio)} · ${cop(Math.round(o.precio / o.servicios))} por servicio</span>
        </a>`).join('\n')}
      </div>
    </div>
  </section>

  <!-- ===== VERIFICACIÓN ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>02</b> Autenticidad</p>
      <h2 class="reveal">Qué registramos de tu tarro<span class="accent">.</span></h2>
      <div class="pp-cols">
        <div class="reveal">
          <p class="section-lead">${c.verificacion}</p>
          <p class="disclaimer">REVTILE documenta lo que puede observarse del producto: el sello, el lote, la fecha y el estado del envase. No somos un laboratorio ni una entidad certificadora, y una inspección visual no reemplaza la verificación con el fabricante. Por eso te damos los datos: para que la verificación la puedas hacer tú.</p>
        </div>
        <div class="reveal">
          <table class="spec">
            <caption>Datos del producto</caption>
            <tbody>
${c.datos.map(([k, v]) => `              <tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== CÓMO TOMARLA ===== -->
  <section class="pp-section pp-section--alt">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>03</b> Cómo tomarla</p>
      <h2 class="reveal">Simple y constante<span class="accent">.</span></h2>
      <ol class="steps">
        <li class="step reveal">
          <span class="step__num">${p.gramos_por_servicio} g</span>
          <h3 class="step__title">Una medida al día</h3>
          <p class="step__text">Con agua o con tu batido, a la hora que prefieras. No importa si es antes o después de entrenar.</p>
        </li>
        <li class="step reveal">
          <span class="step__num">3-4</span>
          <h3 class="step__title">Semanas hasta saturar</h3>
          <p class="step__text">Con la toma diaria constante alcanzas la saturación muscular. No necesita fase de carga.</p>
        </li>
        <li class="step reveal">
          <span class="step__num">${dias}</span>
          <h3 class="step__title">Días con este tarro</h3>
          <p class="step__text">${p.servicios} servicios: unos ${meses} ${meses === 1 ? 'mes' : 'meses'} de toma diaria antes de volver a comprar.</p>
        </li>
      </ol>
      <p class="disclaimer reveal">Los resultados dependen de tu entrenamiento, tu alimentación, tu descanso y tu constancia. Si tienes alguna condición médica, estás embarazada o en lactancia, o tomas medicamentos, consulta a tu médico antes de consumirla.</p>
    </div>
  </section>

  <!-- ===== ENVÍO Y PAGO ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal"><b>04</b> Envío y pago</p>
      <h2 class="reveal">Cómo llega y cómo se paga<span class="accent">.</span></h2>
      <div class="pp-cols">
        <div class="reveal">
          <table class="spec">
            <caption>Envío</caption>
            <tbody>
              <tr><th scope="row">Costo</th><td>Gratis a toda Colombia</td></tr>
              <tr><th scope="row">Tiempo</th><td>${data.envio.dias_habiles} días hábiles, con guía</td></tr>
              <tr><th scope="row">Entrega programada</th><td>Bogotá con pago anticipado: eliges día y hora (lun a sáb, 9 a. m. – 6 p. m.)</td></tr>
            </tbody>
          </table>
        </div>
        <div class="reveal">
          <table class="spec">
            <caption>Pago</caption>
            <tbody>
              <tr><th scope="row">Contraentrega</th><td>Efectivo o transferencia al recibir, en todo el país</td></tr>
              <tr><th scope="row">Anticipado</th><td>Transferencia Bre-B desde Nequi o cualquier banco</td></tr>
              <tr><th scope="row">Combo</th><td>${cop(data.combo.descuento_por_par)} menos por cada par de tarros</td></tr>
              <tr><th scope="row">Seguimiento</th><td>Número propio <span class="mono">RV-</span> rastreable en la página</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== PREGUNTAS ===== -->
  ${nutricional(p)}

  <section class="faq pp-section--alt">
    <div class="faq__inner">
      <p class="section-eyebrow reveal"><b>05</b> Preguntas</p>
      <h2 class="section-title reveal">Sobre esta creatina<span class="accent">.</span></h2>
      <div class="faq__list">
        <details class="faq__item reveal">
          <summary>¿Cómo sé que este tarro es original?</summary>
          <p>Llega sellado de fábrica. Antes del despacho fotografiamos el sello, el número de lote y la fecha de vencimiento <b>de tu tarro</b> y te enviamos las fotos, para que contrastes esos datos con el fabricante.</p>
        </details>
        <details class="faq__item reveal">
          <summary>¿Cuánto me dura?</summary>
          <p>Tomando ${p.gramos_por_servicio} g diarios, <b>${dias} días</b> — unos ${meses} ${meses === 1 ? 'mes' : 'meses'}. Sale a ${cop(porServicio)} por día.</p>
        </details>
        <details class="faq__item reveal">
          <summary>¿Necesito fase de carga?</summary>
          <p>No. Con ${p.gramos_por_servicio} g diarios de forma constante alcanzas la saturación en tres o cuatro semanas. La fase de carga solo acelera ese proceso; el resultado final es el mismo.</p>
        </details>
        <details class="faq__item reveal">
          <summary>¿Puedo pagar al recibir?</summary>
          <p>Sí, contraentrega en todo el país: pagas en efectivo o por transferencia al recibir, con el mismo envío gratis.</p>
        </details>
        <details class="faq__item reveal">
          <summary>¿Y si llega con el sello roto?</summary>
          <p>Avísanos por WhatsApp dentro de las 24 horas siguientes a la entrega, con fotos o video, y lo cambiamos sin costo. Las condiciones completas están en <a class="link" href="terminos.html">términos y garantía</a>.</p>
        </details>
      </div>
    </div>
  </section>

  <!-- ===== OTRAS PRESENTACIONES ===== -->
  <section class="pp-section">
    <div class="pp-section__inner">
      <p class="section-eyebrow reveal">También disponible</p>
      <div class="products__grid" style="margin-top:16px">
${otros.map((o) => `        <article class="product reveal">
          <div class="product__photo"><img src="${o.imagen}" alt="${o.alt}" loading="lazy"></div>
          <div class="product__info">
            <p class="product__brand">${o.marca}</p>
            <h3 class="product__name"><a class="product__link" href="${o.pagina}">${o.nombre}</a></h3>
            <p class="product__size">${o.gramos} g · ${o.servicios} servicios</p>
            <div class="product__pricing"><span class="product__price">${cop(o.precio)}</span></div>
            <p class="product__serving"><b>${cop(Math.round(o.precio / o.servicios))}</b> por servicio</p>
            <a class="btn btn--ghost btn--full" href="${o.pagina}">Ver la ficha</a>
          </div>
        </article>`).join('\n')}
      </div>
    </div>
  </section>

  </main>

${footer()}

  <!-- CTA fija en móvil -->
  <div class="pp-sticky" id="ppSticky" aria-hidden="true">
    <div class="pp-sticky__price">
      <b>${cop(p.precio)}</b>
      <span>${p.gramos} g · envío gratis</span>
    </div>
    <a class="btn btn--primary" href="pedido.html?producto=${p.sku}" tabindex="-1">Pedir <span class="btn__arrow" aria-hidden="true">→</span></a>
  </div>

  <script src="js/product.js?v=3" defer></script>
</body>
</html>
`;
}

for (const p of data.productos) {
  writeFileSync(join(ROOT, p.pagina), ficha(p), 'utf8');
  console.log('  escrita  ' + p.pagina);
}
console.log('\nTres fichas generadas desde productos.json.');
