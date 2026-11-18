/* ===== Centro de mando · Analítica, Inventario, Clientes y Salud =====
   Usa lo que ya define gestion.js (api, esc, fmt, $, mostrarError). Cada pestaña pide sus datos al
   abrirse (/api/admin/ops/...) y los dibuja con SVG y tablas simples, sin librerías externas. */

const OPS = { dias: 30, cargadas: {} };
const num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n == null ? '—' : num(n, 1) + ' %');
const fechaCorta = (f) => { const [, m, d] = String(f).split('-'); return Number(d) + '/' + Number(m); };

/* ── pestañas ── */
function abrirPestana(nombre) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === nombre)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== nombre; });
  if (nombre !== 'pedidos') cargarPestana(nombre, false);
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => abrirPestana(b.dataset.tab)));

async function cargarPestana(nombre, forzar) {
  const caja = $('ops_' + nombre);
  if (!caja) return;
  if (OPS.cargadas[nombre] && !forzar) return;
  caja.innerHTML = '<p class="adm__vacio">Calculando…</p>';
  try {
    if (nombre === 'analitica') caja.innerHTML = vistaAnalitica(await api('ops/analitica?dias=' + OPS.dias), await api('ops/costos'));
    if (nombre === 'inventario') caja.innerHTML = vistaInventario(await api('ops/inventario'));
    if (nombre === 'clientes') caja.innerHTML = vistaClientes(await api('ops/clientes'), await api('ops/recompras'));
    if (nombre === 'salud') caja.innerHTML = vistaSalud(await api('ops/salud'));
    OPS.cargadas[nombre] = true;
    enlazar(caja, nombre);
  } catch (e) {
    caja.innerHTML = '<p class="adm__vacio">No se pudo cargar: ' + esc(e.message) + '</p>';
  }
}

/* ── piezas de dibujo ── */
const kpi = (valor, etiqueta, nota) => `<div class="ops__kpi"><b>${valor}</b><span>${etiqueta}</span>${nota ? `<small>${nota}</small>` : ''}</div>`;

function barras(serie, clave, formato) {
  const max = Math.max(1, ...serie.map((s) => s[clave]));
  const w = 600, h = 130, ancho = w / serie.length;
  const rects = serie.map((s, i) => {
    const alto = Math.round((s[clave] / max) * (h - 18));
    return `<rect x="${(i * ancho + 1).toFixed(1)}" y="${h - 16 - alto}" width="${Math.max(1, ancho - 2).toFixed(1)}" height="${alto}" rx="1"><title>${esc(fechaCorta(s.dia))}: ${esc(formato(s[clave]))}</title></rect>`;
  }).join('');
  return `<svg class="ops__barras" viewBox="0 0 ${w} ${h}" role="img" aria-label="Ventas por día" preserveAspectRatio="none">${rects}
    <text x="0" y="${h - 3}">${esc(fechaCorta(serie[0].dia))}</text><text x="${w}" y="${h - 3}" text-anchor="end">${esc(fechaCorta(serie[serie.length - 1].dia))}</text></svg>`;
}

function chispa(serie) {
  const max = Math.max(1, ...serie);
  const w = 90, h = 22, ancho = w / serie.length;
  return `<svg class="ops__chispa" viewBox="0 0 ${w} ${h}" aria-hidden="true">${serie.map((v, i) => `<rect x="${(i * ancho).toFixed(1)}" y="${h - Math.round((v / max) * h)}" width="${(ancho - 0.6).toFixed(1)}" height="${Math.round((v / max) * h)}"/>`).join('')}</svg>`;
}

const aviso = (txt) => `<p class="ops__aviso">${txt}</p>`;

/* ── Analítica ── */
function vistaAnalitica(d, c) {
  const r = d.resumen;
  const margenTxt = r.margenPesos == null ? 'sin costos' : fmt(r.margenPesos);
  const falta = r.productosConCosto < r.productosTotal;
  const em = d.embudo
    ? d.embudo.map((p) => `<div class="ops__paso"><div class="ops__paso-barra" style="width:${Math.max(2, d.embudo[0].n ? (p.n / d.embudo[0].n) * 100 : 0)}%"></div><span>${esc(p.nombre)}</span><b>${num(p.n)}</b><em>${p.pctPaso == null ? '' : pct(p.pctPaso) + ' del paso anterior'}</em></div>`).join('')
    : aviso('Aún no hay eventos: ejecuta <b>db/schema-v6.sql</b> en D1 y espera algunas visitas.');
  const t = d.tiempos;
  const horas = (m) => (m && m.horas != null ? num(m.horas / 24 >= 1 ? m.horas / 24 : m.horas, 1) + (m.horas / 24 >= 1 ? ' días' : ' h') : '—');
  const costos = c.costos ? `
    <details class="ops__costos"><summary>Costos de los productos ${falta ? '<i>(faltan algunos: sin costo no hay margen)</i>' : ''}</summary>
      <div class="ops__tabla">${c.costos.map((p) => `<div class="ops__fila"><span>${esc(p.nombre)}<small>precio ${fmt(p.precio)}</small></span>
        <input type="number" min="0" step="1000" data-costo="${esc(p.k)}" value="${p.costo == null ? '' : p.costo}" placeholder="costo $">
        <em>${p.margen ? fmt(p.margen.pesos) + ' · ' + pct(p.margen.pct) : '—'}</em></div>`).join('')}</div>
      <button type="button" class="btn btn--ghost" data-accion="guardar-costos">Guardar costos</button></details>` : '';
  return `
    <div class="ops__barra-titulo"><label>Periodo <select id="opsDias">${[7, 30, 90, 180].map((x) => `<option value="${x}" ${x === d.dias ? 'selected' : ''}>${x} días</option>`).join('')}</select></label></div>
    <div class="ops__kpis">
      ${kpi(fmt(r.ingresos), 'ingresos', num(r.pedidos) + ' pedidos')}
      ${kpi(fmt(r.ticket), 'ticket medio')}
      ${kpi(fmt(r.descuentos), 'en descuentos', 'combos y cupones')}
      ${kpi(margenTxt, 'margen', falta ? r.productosConCosto + ' de ' + r.productosTotal + ' con costo' : 'precio de lista − costo')}
    </div>
    <p class="ops__sub">Ingresos por día</p>${barras(d.ventasDia, 'total', fmt)}
    <p class="ops__sub">Embudo de conversión <small>(sesiones distintas; sin datos personales)</small></p><div class="ops__embudo">${em}</div>
    <p class="ops__sub">Tiempos <small>(del historial de estados)</small></p>
    <div class="ops__kpis">${kpi(t ? horas(t.despacho) : '—', 'del pedido al despacho', t ? t.despacho.n + ' pedidos' : 'sin historial')}${kpi(t ? horas(t.entrega) : '—', 'del pedido a la entrega', t ? t.entrega.n + ' pedidos' : '')}${kpi(t ? horas(t.transporte) : '—', 'en transporte', t ? t.transporte.n + ' pedidos' : '')}</div>
    <p class="ops__sub">Productos</p>
    <div class="ops__tabla">${d.productos.length ? d.productos.map((p) => `<div class="ops__fila"><span>${esc(p.nombre)}</span><b>${num(p.unidades)} uds</b><b>${fmt(p.ingreso)}</b><em>${p.margen ? fmt(p.margen.pesos) + ' · ' + pct(p.margen.pct) : 'sin costo'}</em></div>`).join('') : '<p class="adm__vacio">Sin ventas en este periodo.</p>'}</div>
    <div class="ops__dos">
      <div><p class="ops__sub">Ciudades</p><div class="ops__tabla">${d.ciudades.map((x) => `<div class="ops__fila"><span>${esc(x.ciudad)}</span><b>${num(x.n)}</b><em>${fmt(x.total)}</em></div>`).join('') || '—'}</div></div>
      <div><p class="ops__sub">Pago y cupones</p><div class="ops__tabla">${d.metodos.map((x) => `<div class="ops__fila"><span>${esc(x.metodo_pago)}</span><b>${num(x.n)}</b><em>${fmt(x.total)}</em></div>`).join('')}${d.cupones.map((x) => `<div class="ops__fila"><span>cupón ${esc(x.cupon)}</span><b>${num(x.usos)}</b><em>−${fmt(x.descuento)}</em></div>`).join('')}</div></div>
    </div>
    ${d.interes && d.interes.length ? `<p class="ops__sub">Interés por producto <small>(sesiones que lo vieron y que lo añadieron)</small></p><div class="ops__tabla">${d.interes.map((x) => `<div class="ops__fila"><span>${esc(x.k)}</span><b>${num(x.vieron)} vieron</b><b>${num(x.canasta)} añadieron</b><em>${x.vieron ? pct((x.canasta / x.vieron) * 100) : '—'}</em></div>`).join('')}</div>` : ''}
    ${costos}`;
}

/* ── Inventario ── */
const URG = { ya: ['ya', 'Reponer ya'], pronto: ['pronto', 'Reponer pronto'], ok: ['ok', 'Bien'], sin_ventas: ['sin', 'Sin ventas'] };
function vistaInventario(d) {
  const a = d.ajustes;
  return `
    <div class="ops__ajustes">
      <label>El proveedor tarda <input type="number" min="1" max="365" id="opsLead" value="${a.lead_time_dias}"> días</label>
      <label>Quiero cubrir <input type="number" min="1" max="365" id="opsCob" value="${a.cobertura_dias}"> días más</label>
      <button type="button" class="btn btn--ghost" data-accion="guardar-ajustes">Guardar</button>
    </div>
    ${aviso('El ritmo de venta es un promedio suavizado de los últimos 60 días. «Reponer ya» significa que lo que queda no alcanza hasta que llegue un nuevo pedido al proveedor.')}
    <div class="ops__tabla ops__tabla--inv">${d.suplementos.map((p) => {
      const [cls, txt] = URG[p.urgencia];
      return `<div class="ops__inv ops__inv--${cls}">
        <div class="ops__inv-nombre"><b>${esc(p.nombre)}</b><span class="ops__etiqueta ops__etiqueta--${cls}">${txt}</span></div>
        <div class="ops__inv-datos">
          <span><b>${num(p.restante)}</b> de ${num(p.base)}<small>quedan</small></span>
          <span><b>${num(p.velocidad, 2)}</b>/día<small>ritmo</small></span>
          <span><b>${p.diasRestantes == null ? '—' : num(p.diasRestantes)}</b> días<small>${p.agotadoEn ? 'se acaba ' + esc(fechaCorta(p.agotadoEn)) : 'sin ventas'}</small></span>
          <span><b>${num(p.sugerido)}</b> uds<small>pedir hoy</small></span>
          <span>${chispa(p.serie)}<small>${num(p.ult30)} en 30 días</small></span>
        </div></div>`;
    }).join('')}</div>
    <p class="ops__sub">Creatinas <small>(sin control de stock aquí: solo su ritmo de venta)</small></p>
    <div class="ops__tabla">${d.creatinas.map((p) => `<div class="ops__fila"><span>${esc(p.nombre)}</span><b>${num(p.ult30)} en 30 días</b><b>${num(p.velocidad, 2)}/día</b><em>${chispa(p.serie)}</em></div>`).join('')}</div>`;
}

/* ── Clientes ── */
const SEG = { vip: 'VIP', recurrente: 'Recurrente', nuevo: 'Nuevo', en_riesgo: 'En riesgo', dormido: 'Dormido' };
function vistaClientes(d, rc) {
  if (rc.faltaMigracion) rc = { recompras: [] };
  const k = d.kpis;
  const aviso1 = rc.recompras.length
    ? rc.recompras.map((x) => `<div class="ops__fila"><span>${esc(x.nombre)}<small>${esc(x.producto)} · ${x.diasFaltan <= 0 ? 'ya toca' : 'en ' + x.diasFaltan + ' días'}</small></span>
        <a class="btn btn--ghost" target="_blank" rel="noopener" href="https://wa.me/57${esc(String(x.telefono).replace(/\D/g, ''))}?text=${encodeURIComponent(x.mensaje)}">Avisar por WhatsApp</a></div>`).join('')
    : '<p class="adm__vacio">Nadie para avisar por ahora. Aparecen los clientes que marcaron «avísame» y a los que se les está acabando el producto.</p>';
  return `
    <p class="ops__sub">Para avisar <small>(marcaron «avísame cuando se me acabe»)</small></p><div class="ops__tabla">${aviso1}</div>
    <div class="ops__kpis">${kpi(num(k.clientes), 'clientes')}${kpi(pct(k.recompra), 'vuelven a comprar')}${kpi(fmt(k.valorMedio), 'valor por cliente')}${kpi(num(k.pedidosPorCliente, 2), 'pedidos por cliente')}</div>
    <div class="ops__segmentos">${Object.keys(SEG).map((s) => `<span class="ops__seg ops__seg--${s}"><b>${num(d.segmentos[s])}</b>${SEG[s]}</span>`).join('')}</div>
    ${aviso('Segmentos: <b>nuevo</b> compró hace menos de 45 días · <b>recurrente / VIP</b> (3+ pedidos) vuelve dentro de su ritmo · <b>en riesgo</b> pasó 1,5 veces su ritmo · <b>dormido</b> más de 120 días.')}
    <div class="ops__tabla">${d.clientes.map((c) => `<div class="ops__fila"><span>${esc(c.nombre)}<small>${esc(c.ciudad)} · ${num(c.pedidos)} pedido(s) · última compra hace ${num(c.recencia)} días</small></span><b>${fmt(c.gastado)}</b><em class="ops__seg ops__seg--${c.segmento}">${SEG[c.segmento]}</em>
      <a class="btn btn--ghost" target="_blank" rel="noopener" href="https://wa.me/57${esc(String(c.tel).replace(/\D/g, ''))}">WhatsApp</a></div>`).join('') || '<p class="adm__vacio">Aún no hay clientes.</p>'}</div>`;
}

/* ── Salud ── */
function vistaSalud(d) {
  const m = d.migracion;
  const alertas = d.alertas.length ? d.alertas.map((a) => `<p class="ops__alerta ops__alerta--${a.nivel}">${esc(a.texto)}</p>`).join('') : '<p class="ops__ok">Sin alertas.</p>';
  return `
    ${m.completa ? '<p class="ops__ok">Base de datos al día: migración v6 completa.</p>' : `<p class="ops__alerta ops__alerta--alta">Falta ejecutar <b>db/schema-v6.sql</b> en D1 (Console). Faltan: ${m.faltan.map(esc).join(', ')}.</p>`}
    <p class="ops__sub">Alertas</p>${alertas}
    <div class="ops__kpis">${kpi(num(d.conteos.pedidos), 'pedidos guardados')}${kpi(d.conteos.eventos == null ? '—' : num(d.conteos.eventos), 'eventos guardados')}${kpi(d.conteos.eventos24h == null ? '—' : num(d.conteos.eventos24h), 'eventos en 24 h')}</div>
    <p class="ops__sub">Transportadora</p>
    <div class="ops__ajustes"><button type="button" class="btn btn--primary" data-accion="sincronizar">Sincronizar envíos con Skydropx</button><span id="opsSync" class="ops__sub"></span></div>
    ${aviso('Revisa los pedidos verificados o despachados que ya tienen guía (hasta 15 por vez) y avanza su estado según la transportadora.')}
    <p class="ops__sub">Errores del servidor <small>(últimos 30)</small></p>
    ${d.erroresPorRuta.length ? `<div class="ops__tabla">${d.erroresPorRuta.map((x) => `<div class="ops__fila"><span>${esc(x.ruta)}</span><b>${num(x.n)} en 7 días</b></div>`).join('')}</div>` : ''}
    <div class="ops__tabla">${d.errores.length ? d.errores.map((e) => `<div class="ops__fila"><span>${esc(e.ruta)}<small>${esc(e.mensaje)}</small></span><em>${esc(e.creado_en)}</em></div>`).join('') : '<p class="adm__vacio">Sin errores registrados.</p>'}</div>`;
}

/* ── acciones de cada pestaña ── */
function enlazar(caja, nombre) {
  const sel = caja.querySelector('#opsDias');
  if (sel) sel.addEventListener('change', () => { OPS.dias = Number(sel.value); cargarPestana('analitica', true); });
  caja.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', async () => {
    try {
      if (b.dataset.accion === 'guardar-costos') {
        for (const i of caja.querySelectorAll('[data-costo]')) {
          await api('ops/costos', { method: 'POST', body: JSON.stringify({ k: i.dataset.costo, costo: i.value === '' ? null : Number(i.value) }) });
        }
        OPS.cargadas.analitica = false; cargarPestana('analitica', true);
      }
      if (b.dataset.accion === 'guardar-ajustes') {
        await api('ops/ajustes', { method: 'POST', body: JSON.stringify({ clave: 'lead_time_dias', valor: Number($('opsLead').value) }) });
        await api('ops/ajustes', { method: 'POST', body: JSON.stringify({ clave: 'cobertura_dias', valor: Number($('opsCob').value) }) });
        cargarPestana('inventario', true);
      }
      if (b.dataset.accion === 'sincronizar') {
        b.disabled = true; b.textContent = 'Sincronizando…';
        const r = await api('ops/sincronizar', { method: 'POST', body: '{}' });
        cargarPestana('salud', true).then(() => { const s = $('opsSync'); if (s) s.textContent = r.cambios.length ? r.cambios.length + ' pedido(s) actualizados' : 'Todo al día (' + r.revisados + ' revisados)'; });
      }
    } catch (e) { mostrarError(e.message); b.disabled = false; }
  }));
}
