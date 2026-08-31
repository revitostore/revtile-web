/* ===== Rastreo público de pedidos Revtile ===== */

const $ = (id) => document.getElementById(id);

const ORDEN = ['nuevo', 'verificado', 'despachado', 'entregado'];
const BADGES = {
  nuevo: ['Recibido', 'teal'],
  verificado: ['Pago verificado', 'lima'],
  despachado: ['En camino', 'gold'],
  entregado: ['Entregado ✓', 'lima'],
  cancelado: ['Cancelado', 'rojo'],
};

/* enlaces públicos de rastreo por transportadora (con la guía) */
const TRANSPORTADORAS = {
  coordinadora: { nombre: 'Coordinadora', url: (g) => `https://coordinadora.com/rastreo/rastreo-de-guia/detalle-de-rastreo-de-guia/?guia=${g}` },
  servientrega: { nombre: 'Servientrega', url: (g) => `https://www.servientrega.com/wps/portal/rastreo-envio?guia=${g}` },
  interrapidisimo: { nombre: 'Inter Rapidísimo', url: (g) => `https://interrapidisimo.com/sigue-tu-envio/?guia=${g}` },
  envia: { nombre: 'Envía', url: (g) => `https://envia.co/?guia=${g}` },
  tcc: { nombre: 'TCC', url: (g) => `https://tcc.com.co/rastrear-envio/?guia=${g}` },
  deprisa: { nombre: 'Deprisa', url: (g) => `https://www.deprisa.com/Tracking/index?track=${g}` },
  skydropx: { nombre: 'Skydropx', url: (g) => `https://rastreo.skydropx.com/?tracking=${g}` },
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaBonita(sqlite) {
  // creado_en viene como 'YYYY-MM-DD HH:MM:SS' en UTC
  try {
    const d = new Date(sqlite.replace(' ', 'T') + 'Z');
    return `Pedido hecho el ${d.getDate()} de ${MESES[d.getMonth()]}`;
  } catch (e) { return ''; }
}

function pintar(p) {
  $('rasResultado').hidden = false;
  $('rasResId').textContent = p.id;
  $('rasResFecha').textContent = fechaBonita(p.creado_en);

  const [txt, color] = BADGES[p.estado] || BADGES.nuevo;
  const badge = $('rasResBadge');
  badge.textContent = txt;
  badge.className = 'ras__badge ras__badge--' + color;

  /* línea de tiempo: pintar pasos alcanzados */
  const idx = ORDEN.indexOf(p.estado); // cancelado => -1: ningún paso "hecho" extra
  document.querySelectorAll('.ras__paso').forEach((el) => {
    const i = ORDEN.indexOf(el.dataset.paso);
    el.classList.toggle('is-hecho', idx >= 0 && i <= idx);
    el.classList.toggle('is-actual', idx >= 0 && i === idx);
  });
  $('rasTimeline').classList.toggle('is-cancelado', p.estado === 'cancelado');

  /* entrega programada */
  if (p.entrega_dia) {
    $('rasProg').hidden = false;
    $('rasProgTxt').textContent = `${p.entrega_dia} · ${p.entrega_hora || ''}`;
  } else {
    $('rasProg').hidden = true;
  }

  /* guía de transportadora */
  if (p.guia) {
    const t = TRANSPORTADORAS[(p.transportadora || '').toLowerCase()] || null;
    $('rasGuia').hidden = false;
    $('rasGuiaNum').textContent = p.guia;
    $('rasGuiaEmp').textContent = t ? t.nombre : (p.transportadora || 'transportadora');
    const link = $('rasGuiaLink');
    if (t) { link.href = t.url(encodeURIComponent(p.guia)); link.hidden = false; }
    else { link.hidden = true; }
    $('rasDespachadoTxt').textContent = 'Tu creatina va en camino con guía ' + p.guia;
  } else {
    $('rasGuia').hidden = true;
  }

  /* productos (sin datos personales) */
  $('rasItems').innerHTML = (p.items || [])
    .map((i) => `<p>▪ ${i.c}× ${i.nombre}</p>`)
    .join('') + `<p class="ras__total">Total: <b>$${Number(p.total).toLocaleString('es-CO')}</b>${p.metodo_pago === 'contraentrega' ? ' (pagas al recibir)' : ''}</p>`;

  $('rasWa').href = 'https://wa.me/573214569600?text=' + encodeURIComponent(`Hola Revtile 🦎, pregunta sobre mi pedido ${p.id}`);
}

function mostrarError(msg) {
  const el = $('rasError');
  el.textContent = msg;
  el.hidden = false;
  $('rasResultado').hidden = true;
  setTimeout(() => { el.hidden = true; }, 6000);
}

let buscando = false;
async function buscar() {
  if (buscando) return;
  let id = $('rasId').value.trim().toUpperCase();
  if (id && !id.startsWith('RV-')) id = 'RV-' + id.replace(/^RV/, '');
  if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return mostrarError('Escribe un número de pedido válido, por ejemplo RV-K8M2X.');
  buscando = true;
  $('rasBtn').textContent = 'Buscando…';
  try {
    const r = await fetch('/api/rastreo?id=' + encodeURIComponent(id));
    const data = await r.json();
    if (data.ok) {
      pintar(data);
      history.replaceState(null, '', '?id=' + id);
    } else {
      mostrarError(data.error === 'No encontramos ese pedido'
        ? 'No encontramos ese pedido — revisa el número o escríbenos por WhatsApp.'
        : 'No pudimos consultar ahora mismo — intenta en un momento.');
    }
  } catch (e) {
    mostrarError('Sin conexión con el sistema — intenta de nuevo en un momento.');
  }
  $('rasBtn').textContent = 'Rastrear';
  buscando = false;
}

$('rasBtn').addEventListener('click', buscar);
$('rasId').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });

/* ?id=RV-XXXXX en la URL: buscar de una */
const idParam = new URLSearchParams(location.search).get('id');
if (idParam) {
  $('rasId').value = idParam.toUpperCase();
  buscar();
}
