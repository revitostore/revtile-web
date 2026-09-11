/* ===== Centro de mando Revtile =====
   Acceso: Cloudflare Access (correo) si está activo, o llave de respaldo (ADMIN_KEY). */

/* Si el panel esta mostrando el archivo o la lista viva. Se declara
   aqui arriba porque tarjetaPedido() la lee, y esa se define mucho
   antes de donde vive el boton que la cambia. */
let verArchivo = false;


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
      <button type="button" class="adm__avisar">📲 Avisar</button>
      <button type="button" class="adm__archivar">${verArchivo ? 'Devolver a la lista' : 'Archivar'}</button>
      ${verArchivo ? '<button type="button" class="adm__eliminar">Eliminar</button>' : ''}
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
  /* 📲 Avisar: abre WhatsApp con el mensaje del estado ya escrito.
     Toma lo que está puesto en los campos de la tarjeta (estado, guía,
     transportadora), así se puede guardar y avisar de una. Las fotos del
     sello y el lote se adjuntan a mano en el mismo chat que se abre. */
  el.querySelector('.adm__avisar').addEventListener('click', () => {
    const estado = el.querySelector('[data-campo="estado"]').value;
    const guia = el.querySelector('[data-campo="guia"]').value.trim();
    const transp = el.querySelector('[data-campo="transportadora"]').value;
    const nombrePila = (p.nombre || '').trim().split(/\s+/)[0];
    const rastreo = 'revtile.com.co/rastreo?id=' + p.id;
    const esCE = p.metodo_pago === 'contraentrega';
    let lineas;
    if (estado === 'despachado') {
      lineas = [
        `Hola ${nombrePila}! Soy David de REVTILE 🦎`,
        '',
        `Tu pedido *${p.id}* ya va en camino 🚚` + (guia ? ` con ${transp || 'la transportadora'} — guía *${guia}*.` : '.'),
        `Síguelo en vivo aquí: ${rastreo}`,
        '',
        'Te comparto ahora las fotos del sello y el lote de tu tarro 👇',
      ];
    } else if (estado === 'verificado') {
      lineas = [
        `Hola ${nombrePila}! Soy David de REVTILE 🦎`,
        '',
        esCE
          ? `Tu pedido *${p.id}* quedó confirmado ✅ y entra a despacho — pagas al recibirlo.`
          : `Recibimos tu pago ✅ y tu pedido *${p.id}* entra a despacho.`,
        `Puedes seguirlo aquí: ${rastreo}`,
      ];
    } else if (estado === 'entregado') {
      lineas = [
        `${nombrePila}, tu pedido *${p.id}* figura como entregado 🎉`,
        '',
        'Esperamos que la rompas en el gym 💪 Cualquier duda con tu creatina, escríbeme por aquí.',
        '',
        '— David · REVTILE 🦎',
      ];
    } else {
      lineas = [
        `Hola ${nombrePila}! Soy David de REVTILE 🦎`,
        '',
        `Te escribo por tu pedido *${p.id}*. Puedes ver su estado aquí: ${rastreo}`,
      ];
    }
    window.open('https://wa.me/57' + p.telefono + '?text=' + encodeURIComponent(lineas.join('\n')), '_blank');
  });

  el.querySelector('.adm__archivar').addEventListener('click', async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      await api('archivar', { method: 'POST', body: JSON.stringify({ id: p.id, deshacer: verArchivo }) });
      cargar(false);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = verArchivo ? 'Devolver a la lista' : 'Archivar';
      mostrarError('No se pudo archivar: ' + e.message);
    }
  });

  const borrar = el.querySelector('.adm__eliminar');
  if (borrar) borrar.addEventListener('click', async () => {
    /* Se pide escribir el numero a mano: un pedido borrado no se
       recupera, y un boton de "¿seguro?" se acepta sin leerlo. */
    const escrito = window.prompt(
      'Esto borra el pedido ' + p.id + ' de la base de datos.\n' +
      'No se puede deshacer.\n\n' +
      'Si estás seguro, escribe ' + p.id + ':');
    if (escrito === null) return;
    if (escrito.trim().toUpperCase() !== p.id.toUpperCase()) {
      mostrarError('El número no coincide. No se borró nada.');
      return;
    }
    try {
      await api('eliminar', { method: 'POST', body: JSON.stringify({ id: p.id, confirmar: escrito.trim() }) });
      cargar(false);
    } catch (e) {
      mostrarError('No se pudo eliminar: ' + e.message);
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
    if (verArchivo) params.set('archivados', '1');
    const data = await api('pedidos?' + params.toString());
    pedidos = data.pedidos;
    statsDe(pedidos);
    cont.innerHTML = '';
    if (!pedidos.length) {
      cont.innerHTML = '<p class="adm__vacio">' +
        (verArchivo ? 'El archivo está vacío.' : 'No hay pedidos con ese filtro.') + '</p>';
      return;
    }
    pedidos.forEach((p) => cont.appendChild(tarjetaPedido(p)));
  } catch (e) {
    cont.innerHTML = '<p class="adm__vacio">Error cargando pedidos: ' + e.message + '</p>';
  }
}

$('admEstado').addEventListener('change', () => cargar());
$('admRefrescar').addEventListener('click', () => cargar());

/* El archivo es una vista aparte, no un filtro mas del desplegable:
   asi queda claro que lo que se ve ahi ya no esta en la operacion. */
const btnArchivo = document.getElementById('admVerArchivo');
if (btnArchivo) btnArchivo.addEventListener('click', () => {
  verArchivo = !verArchivo;
  btnArchivo.textContent = verArchivo ? '← Volver a los pedidos' : 'Ver archivo';
  btnArchivo.setAttribute('aria-pressed', String(verArchivo));
  document.getElementById('admLista').classList.toggle('adm__lista--archivo', verArchivo);
  cargar();
});

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
