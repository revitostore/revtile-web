/* Piezas que comparten los generadores de páginas (fichas de creatina y
   preventa): pie de página, escape de HTML y fila de datos legales. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/* versión para el cache: huella corta del contenido del archivo */
export const huella = (ruta) => createHash('md5').update(readFileSync(join(RAIZ, ruta))).digest('hex').slice(0, 8);

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Un dato legal que no existe no se anuncia: la fila simplemente no se pinta. */
export const fila = (k, v) => v ? `<div><span class="k">${k}</span><span class="v">${v}</span></div>` : '';

export const SOCIALES = `        <div class="footer__social-row">
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

export const footer = (data) => `  <footer class="footer">
    <div class="footer__grid">
      <div class="footer__brand">
        <p class="footer__logo">REVTILE<span class="nav__dot">.</span></p>
        <p class="footer__tag">Suplementos originales, sellados de fábrica y con lote verificable. Pedido en línea, confirmación por WhatsApp, envío gratis a toda Colombia.</p>
${SOCIALES}
      </div>
      <nav class="footer__col" aria-label="Tienda">
        <p class="footer__title">Tienda</p>
        <a href="index.html#productos">Catálogo</a>
${data.productos.map((p) => `        <a href="${p.pagina}">${p.marca === 'MuscleTech' ? 'MT' : 'ON'} ${p.gramos} g</a>`).join('\n')}
${(data.preventa ? data.preventa.productos : []).map((p) => `        <a href="${p.pagina}">${p.corto}</a>`).join('\n')}
        <a href="preventa.html">Toda la preventa</a>
        <button type="button" class="mal-scoop-foot" data-scoop-abrir hidden>Gana más descuento</button>
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
        <a href="https://wa.me/${data.whatsapp}" target="_blank" rel="noopener">WhatsApp +57 321 456 9600</a>
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
      <p>© 2026 REVTILE · Suplementos originales, sellados y verificables</p>
      <p class="footer__note">Los suplementos no son medicamentos y no sustituyen una alimentación equilibrada. Si tienes una condición médica, consulta a tu médico. REVTILE documenta el estado observable de cada producto antes del despacho; no es un laboratorio ni una entidad certificadora.</p>
    </div>
  </footer>`;
