/* ===== Panel de administración Revtile ===== */

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
    headers: { 'Content-Type': 'application/json', 'x-admin-key': clave, ...(opciones.headers || {}) },
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

/* --- Login --- */
async function entrar(k) {
  clave = k;
  try {
    await api('pedidos');
    localStorage.setItem(KEY_STORAGE, clave);
    $('admLogin').hidden = true;
    $('admPanel').hidden = false;
    $('admSalir').hidden = false;
    await cargar();
    await cargarCupones();
  } catch (e) {
    clave = '';
    const el = $('admLoginError');
    el.textContent = e.message === 'CLAVE' ? 'Clave incorrecta.' : 'No se pudo conectar: ' + e.message;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 5000);
  }
}

$('admEntrar').addEventListener('click', () => entrar($('admKey').value.trim()));
$('admKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar($('admKey').value.trim()); });
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

/* --- Init: sesión recordada --- */
const guardada = localStorage.getItem(KEY_STORAGE);
if (guardada) entrar(guardada);
