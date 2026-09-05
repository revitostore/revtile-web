/* ===== Centro de mando Revtile =====
   Acceso: Cloudflare Access (correo) si está activo, o llave de respaldo (ADMIN_KEY). */

const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const KEY_STORAGE = 'revtile_admin_key';

const ESTADO_INFO = {
  nuevo: ['🔴', 'Nuevo'],
  verificado: ['🟡', 'Verificado'],
  despachado: ['📦', 'Despachado'],
  entregado: ['✅', 'Entregado'],
  cancelado: ['✖', 'Cancelado'],
};
const TRANSPORTADORAS = ['', 'coordinadora', 'servientrega', 'interrapidisimo', 'envia', 'tcc', 'deprisa', 'skydropx', 'otra'];

let clave = '';
let pedidos = [];

async function api(ruta, opciones = {}) {
  const r = await fetch('/api/admin/' + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(clave ? { 'x-admin-key': clave } : {}), ...(opciones.headers || {}) },
  });
  const data = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));
  if (r.status === 401) throw new Error('CLAVE');
  if (!data.ok) throw new Error(data.error || 'Error');
  return data;
}

function mostrarError(msg) {
  const el = $('admError');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000);
}

/* --- Apertura del panel --- */
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function abrirPanel() {
  $('admLogin').hidden = true;
  $('admPanel').hidden = false;
  $('admSalir').hidden = !clave; // con Access no hay sesión local que cerrar
  const hoy = new Date();
  $('admFecha').textContent = `${DIAS_L[hoy.getDay()]} ${hoy.getDate()} de ${MESES_L[hoy.getMonth()]} · vamos con toda 🦎`;
  await cargar();
  await cargarCupones();
  await cargarVerify();
}

async function entrar(k) {
  clave = k;
  try {
    await api('pedidos');
    if (clave) localStorage.setItem(KEY_STORAGE, clave);
    await abrirPanel();
    return true;
  } catch (e) {
    clave = '';
    return e.message === 'CLAVE' ? false : null; // null = error de sistema
  }
}

$('admEntrar').addEventListener('click', async () => {
  const ok = await entrar($('admKey').value.trim());
  if (ok === true) return;
  const el = $('admLoginError');
  el.textContent = ok === false ? 'Llave incorrecta.' : 'No se pudo conectar con el sistema.';
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000);
});
$('admKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('admEntrar').click(); });
$('admSalir').addEventListener('click', () => {
  localStorage.removeItem(KEY_STORAGE);
  location.reload();
});

/* --- Pedidos --- */
function statsDe(lista) {
  const hoy = new Date();
  const esHoy = (s) => {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };
  const esMes = (s) => {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };
  $('stHoy').textContent = lista.filter((p) => esHoy(p.creado_en)).length;
  $('stNuevos').textContent = lista.filter((p) => p.estado === 'nuevo' || p.estado === 'verificado').length;
  $('stMes').textContent = fmt(lista.filter((p) => esMes(p.creado_en) && p.estado !== 'cancelado').reduce((a, p) => a + (p.total || 0), 0));
}

function tarjetaPedido(p) {
  const [icono] = ESTADO_INFO[p.estado] || ESTADO_INFO.nuevo;
  let items = [];
  try { items = JSON.parse(p.items); } catch (e) { /* nada */ }
  const fecha = new Date(p.creado_en.replace(' ', 'T') + 'Z')
    .toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  const el = document.createElement('div');
  el.className = 'adm__pedido adm__pedido--' + p.estado;
  el.innerHTML = `
    <div class="adm__ped-head">
      <b>${icono} ${p.id}</b>
      <span>${fecha}</span>
      <b class="adm__ped-total">${fmt(p.total)}</b>
    </div>
    <div class="adm__ped-body">
      <p>👤 <b>${p.nombre}</b> · <a href="https://wa.me/57${p.telefono}" target="_blank" rel="noopener">📱 ${p.telefono}</a></p>
      <p>📍 ${p.direccion}, ${p.ciudad}${p.apto ? ' · ' + p.apto : ''}${p.porteria ? ' · deja en portería ✓' : ''}</p>
      <p>🛒 ${items.map((i) => `${i.c}× ${i.nombre}`).join(' + ') || p.items}</p>
      <p>${p.metodo_pago === 'contraentrega' ? '🚚 CONTRAENTREGA — cobrar ' + fmt(p.total) + ' al entregar' : '⚡ Anticipado Bre-B'}
         ${p.entrega_dia ? ` · 📦 <b>${p.entrega_dia} ${p.entrega_hora || ''}</b>` : ''}
         ${p.cupon ? ` · 🎟 ${p.cupon} (−${fmt(p.descuento)})` : ''}</p>
      ${p.direccion_mapa ? `<p>🗺 Según el mapa: ${p.direccion_mapa}${p.lat ? ` · <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">ver punto</a>` : ''}</p>` : ''}
    </div>
    <div class="adm__ped-ctrl">
      <select data-campo="estado">
        ${Object.entries(ESTADO_INFO).map(([v, [ic, tx]]) => `<option value="${v}" ${p.estado === v ? 'selected' : ''}>${ic} ${tx}</option>`).join('')}
      </select>
      <input type="text" data-campo="guia" placeholder="N° de guía" value="${p.guia || ''}">
      <select data-campo="transportadora">
        ${TRANSPORTADORAS.map((t) => `<option value="${t}" ${(p.transportadora || '') === t ? 'selected' : ''}>${t || 'Transportadora…'}</option>`).join('')}
      </select>
      <input type="text" data-campo="nota" placeholder="Nota interna" value="${p.nota || ''}">
      <button type="button" class="btn btn--primary adm__guardar">Guardar</button>
      <button type="button" class="btn btn--ghost" data-registrar="${p.id}" data-sku="${(items[0] && items[0].k) || 'on'}">Registrar unidad</button>
    </div>`;

  el.querySelector('.adm__guardar').addEventListener('click', async (ev) => {
    const btn = ev.target;
    btn.textContent = '…';
    const cuerpo = { id: p.id };
    el.querySelectorAll('[data-campo]').forEach((c) => { cuerpo[c.dataset.campo] = c.value; });
    try {
      await api('pedido', { method: 'POST', body: JSON.stringify(cuerpo) });
      btn.textContent = 'Guardado ✓';
      setTimeout(() => { btn.textContent = 'Guardar'; }, 2000);
      cargar(false);
    } catch (e) {
      btn.textContent = 'Guardar';
      mostrarError('No se pudo guardar: ' + e.message);
    }
  });
  return el;
}

async function cargar(conLoader = true) {
  const cont = $('admLista');
  if (conLoader) cont.innerHTML = '<p class="adm__vacio">Cargando…</p>';
  try {
    const params = new URLSearchParams();
    if ($('admEstado').value) params.set('estado', $('admEstado').value);
    if ($('admBuscar').value.trim()) params.set('q', $('admBuscar').value.trim());
    const data = await api('pedidos?' + params.toString());
    pedidos = data.pedidos;
    statsDe(pedidos);
    cont.innerHTML = '';
    if (!pedidos.length) {
      cont.innerHTML = '<p class="adm__vacio">No hay pedidos con ese filtro.</p>';
      return;
    }
    pedidos.forEach((p) => cont.appendChild(tarjetaPedido(p)));
  } catch (e) {
    cont.innerHTML = '<p class="adm__vacio">Error cargando pedidos: ' + e.message + '</p>';
  }
}

$('admEstado').addEventListener('change', () => cargar());
$('admRefrescar').addEventListener('click', () => cargar());
let tBuscar;
$('admBuscar').addEventListener('input', () => {
  clearTimeout(tBuscar);
  tBuscar = setTimeout(() => cargar(false), 400);
});

/* --- Cupones --- */
async function cargarCupones() {
  try {
    const data = await api('cupones');
    $('admCupones').innerHTML = data.cupones.length
      ? data.cupones.map((c) => `
          <div class="adm__cupon ${c.activo ? '' : 'is-off'}">
            <b>${c.codigo}</b>
            <span>${c.tipo === 'porcentaje' ? c.valor + '%' : fmt(c.valor)} de descuento</span>
            <span>${c.usos}${c.max_usos ? '/' + c.max_usos : ''} usos</span>
            ${c.min_total ? `<span>mín. ${fmt(c.min_total)}</span>` : ''}
            <button type="button" class="adm__cupon-toggle" data-codigo="${c.codigo}" data-activo="${c.activo}">${c.activo ? 'Desactivar' : 'Activar'}</button>
          </div>`).join('')
      : '<p class="adm__vacio">Sin cupones aún — crea el primero arriba.</p>';

    document.querySelectorAll('.adm__cupon-toggle').forEach((b) => {
      b.addEventListener('click', async () => {
        const c = data.cupones.find((x) => x.codigo === b.dataset.codigo);
        try {
          await api('cupon', { method: 'POST', body: JSON.stringify({ ...c, activo: !c.activo }) });
          cargarCupones();
        } catch (e) { mostrarError(e.message); }
      });
    });
  } catch (e) {
    $('admCupones').innerHTML = '<p class="adm__vacio">No se pudieron cargar los cupones (¿ya ejecutaste schema-v2.sql?).</p>';
  }
}

$('cuCrear').addEventListener('click', async () => {
  try {
    await api('cupon', {
      method: 'POST',
      body: JSON.stringify({
        codigo: $('cuCodigo').value,
        tipo: $('cuTipo').value,
        valor: $('cuValor').value,
        max_usos: $('cuMaxUsos').value || null,
        min_total: $('cuMinTotal').value || 0,
      }),
    });
    $('cuCodigo').value = ''; $('cuValor').value = ''; $('cuMaxUsos').value = ''; $('cuMinTotal').value = '';
    cargarCupones();
  } catch (e) { mostrarError(e.message); }
});

/* --- Init ---
   1) Si Cloudflare Access ya autenticó (entraste con tu correo), el panel abre directo.
   2) Si no, probamos la llave recordada.
   3) Si nada funciona, se muestra la pantalla de llave. */
(async () => {
  if (await entrar('') === true) return;                 // modo Access: sin llave
  const guardada = localStorage.getItem(KEY_STORAGE);
  if (guardada && await entrar(guardada) === true) return;
  $('admLogin').hidden = false;
})();

/* =====================================================================
   REVTILE VERIFY — creación de registros desde el centro de mando
   Un registro por unidad física. 30 segundos por tarro.
   ===================================================================== */

const SKUS_VERIFY = {
  on:    'ON Micronized Creatine 300 g',
  mt:    'MT Platinum Creatine 400 g',
  on120: 'ON Micronized Creatine 600 g',
};

let ultimoLote = localStorage.getItem('revtile_ultimo_lote') || '';
let ultimoVence = localStorage.getItem('revtile_ultimo_vence') || '';
let registros = [];

function urlVerify(codigo) {
  return location.origin + '/verify.html?c=' + codigo;
}

/* El QR se dibuja en el panel (detrás de Cloudflare Access), no en el sitio
   público: así la tienda no carga ninguna librería extra. */
function qrDataUrl(texto) {
  if (!window.QRCode) return Promise.resolve(null);
  return window.QRCode.toDataURL(texto, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
    .catch(() => null);
}

function prefill(pedidoId, sku) {
  $('vfPedido').value = pedidoId || '';
  if (sku) $('vfSku').value = sku;
  if (!$('vfLote').value) $('vfLote').value = ultimoLote;
  if (!$('vfVence').value) $('vfVence').value = ultimoVence;
  $('vfPedido').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('vfLote').focus();
}

async function crearRegistro() {
  const btn = $('vfCrear');
  const cuerpo = {
    pedido_id: $('vfPedido').value.trim(),
    sku: $('vfSku').value,
    lote: $('vfLote').value.trim(),
    vence: $('vfVence').value.trim(),
    sello: $('vfSello').value,
    sello_nota: $('vfSelloNota').value.trim(),
    nota_interna: $('vfNota').value.trim(),
  };
  btn.disabled = true;
  btn.textContent = 'Creando…';
  try {
    const d = await api('verify', { method: 'POST', body: JSON.stringify(cuerpo) });

    /* el lote suele repetirse dentro de la misma caja: se recuerda */
    ultimoLote = cuerpo.lote;
    ultimoVence = cuerpo.vence;
    localStorage.setItem('revtile_ultimo_lote', ultimoLote);
    localStorage.setItem('revtile_ultimo_vence', ultimoVence);

    await mostrarNuevo(d.codigo, d.fotos_activas);
    $('vfSelloNota').value = '';
    $('vfNota').value = '';
    cargarVerify();
  } catch (e) {
    mostrarError(e.message === 'CLAVE' ? 'Sesión caducada' : 'No se pudo crear: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = 'Crear registro';
}

async function mostrarNuevo(codigo, fotosActivas) {
  const caja = $('vfNuevo');
  const url = urlVerify(codigo);
  const qr = await qrDataUrl(url);
  caja.innerHTML = `
    ${qr ? `<img src="${qr}" alt="Código QR del registro ${codigo}">` : ''}
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <span class="codigo">${codigo}</span>
      <span style="font-size:13px;color:var(--ink-dim);word-break:break-all">${url}</span>
      <div class="adm__verify-acciones">
        <button type="button" class="btn btn--ghost" data-copiar="${url}">Copiar enlace</button>
        <a class="btn btn--ghost" href="${url}" target="_blank" rel="noopener">Abrir</a>
        <button type="button" class="btn btn--ghost" data-sticker="${codigo}">Imprimir sticker</button>
      </div>
      ${fotosActivas
        ? `<label class="btn btn--primary" style="cursor:pointer">
             Subir fotos (hasta 4)
             <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-fotos="${codigo}">
           </label>
           <span id="vfFotoMsg" style="font-size:13px;color:var(--ink-dim)"></span>`
        : `<span style="font-size:13px;color:var(--ink-dim)">Fotos desactivadas: falta crear el bucket R2 y atarlo como <b>VERIFY_FOTOS</b>. El registro funciona igual sin ellas.</span>`}
    </div>`;
  caja.hidden = false;
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function subirFotos(codigo, archivos) {
  const msg = $('vfFotoMsg');
  let n = 0;
  for (const archivo of archivos) {
    if (msg) msg.textContent = `Subiendo ${n + 1} de ${archivos.length}…`;
    const fd = new FormData();
    fd.append('codigo', codigo);
    fd.append('foto', archivo);
    try {
      const r = await fetch('/api/admin/verify/foto', {
        method: 'POST',
        headers: clave ? { 'x-admin-key': clave } : {},
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) throw new Error(d.error || 'error');
      n++;
    } catch (e) {
      if (msg) msg.textContent = 'No se pudo subir una foto: ' + e.message;
      return;
    }
  }
  if (msg) msg.textContent = `${n} foto${n === 1 ? '' : 's'} subida${n === 1 ? '' : 's'} ✓`;
  cargarVerify();
}

async function imprimirStickers(codigos) {
  const hoja = $('vfStickers');
  const partes = [];
  for (const c of codigos) {
    const url = urlVerify(c);
    const qr = await qrDataUrl(url);
    partes.push(`
      <div class="adm__sticker">
        <span class="marca">REVTILE VERIFY</span>
        ${qr ? `<img src="${qr}" alt="">` : ''}
        <span class="cod">${c}</span>
        <span class="url">revtile.com.co/verify</span>
      </div>`);
  }
  hoja.innerHTML = partes.join('');
  document.body.classList.add('imprimiendo');
  window.print();
  setTimeout(() => document.body.classList.remove('imprimiendo'), 500);
}

async function anularRegistro(codigo) {
  const motivo = prompt('¿Por qué se anula ' + codigo + '? (queda visible en el registro público)');
  if (!motivo) return;
  try {
    await api('verify/anular', { method: 'POST', body: JSON.stringify({ codigo, motivo }) });
    cargarVerify();
  } catch (e) { mostrarError(e.message); }
}

async function cargarVerify() {
  const cont = $('admVerify');
  if (!cont) return;
  try {
    const d = await api('verify');
    registros = d.registros;
    if (!registros.length) {
      cont.innerHTML = '<p class="adm__vacio">Todavía no hay registros. Crea el primero con el formulario de arriba.</p>';
      return;
    }
    cont.innerHTML = registros.map((r) => {
      let fotos = 0;
      try { fotos = JSON.parse(r.fotos || '[]').length; } catch (e) { /* nada */ }
      const f = new Date(String(r.creado_en).replace(' ', 'T') + 'Z')
        .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
      return `
        <div class="adm__verif ${r.estado === 'anulado' ? 'is-anulado' : ''}">
          <b>${r.codigo}</b>
          <span>${SKUS_VERIFY[r.sku] || r.sku}${r.lote ? ' · lote ' + r.lote : ''}${r.pedido_id ? ' · ' + r.pedido_id : ''} · ${fotos} foto${fotos === 1 ? '' : 's'} · ${f}</span>
          <span class="adm__verif-btns">
            <button type="button" data-abrir="${r.codigo}">Ver</button>
            <button type="button" data-sticker="${r.codigo}">Sticker</button>
            ${r.estado === 'anulado' ? '' : `<button type="button" data-anular="${r.codigo}">Anular</button>`}
          </span>
        </div>`;
    }).join('');
  } catch (e) {
    cont.innerHTML = '<p class="adm__vacio">No se pudieron cargar los registros. ¿Ya ejecutaste <b>db/schema-v3.sql</b> en la consola de D1?</p>';
  }
}

/* Delegación: cubre los botones del formulario, de la lista y de las
   tarjetas de pedido sin volver a enganchar listeners en cada refresco. */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-copiar],[data-sticker],[data-anular],[data-abrir],[data-registrar]');
  if (!t) return;
  if (t.dataset.copiar) {
    navigator.clipboard.writeText(t.dataset.copiar);
    t.textContent = 'Copiado ✓';
    setTimeout(() => { t.textContent = 'Copiar enlace'; }, 1800);
  }
  if (t.dataset.sticker) imprimirStickers([t.dataset.sticker]);
  if (t.dataset.anular) anularRegistro(t.dataset.anular);
  if (t.dataset.abrir) window.open(urlVerify(t.dataset.abrir), '_blank', 'noopener');
  if (t.dataset.registrar) prefill(t.dataset.registrar, t.dataset.sku);
});

document.addEventListener('change', (e) => {
  const inp = e.target.closest('[data-fotos]');
  if (inp && inp.files && inp.files.length) subirFotos(inp.dataset.fotos, Array.from(inp.files).slice(0, 4));
});

if (document.getElementById('vfCrear')) {
  $('vfCrear').addEventListener('click', crearRegistro);
  $('vfSello').addEventListener('change', () => {
    $('vfSelloNota').hidden = $('vfSello').value !== 'observaciones';
  });
  $('vfImprimirDia').addEventListener('click', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const delDia = registros.filter((r) => String(r.creado_en).slice(0, 10) === hoy && r.estado === 'activo');
    if (!delDia.length) { mostrarError('No hay registros creados hoy.'); return; }
    imprimirStickers(delDia.map((r) => r.codigo));
  });
}
