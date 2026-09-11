/* ===== Checkout Revtile: pedido multi-producto + contraentrega o pago Bre-B con entrega programada ===== */

/* --- Configuración (edita aquí precios y tarifas) --- */
const PRODUCTOS = {
  on: { nombre: 'ON Micronized Creatine 300 g', corto: 'ON 300g', precio: 120000, precio_antes: 170000 },
  mt: { nombre: 'MT Platinum Creatine 400 g', corto: 'MT 400g', precio: 140000, precio_antes: 200000 },
  on120: { nombre: 'ON Micronized Creatine 600 g (120 serv.)', corto: 'ON 600g', precio: 170000, precio_antes: 240000 },
};
/* El envío es gratis a cualquier ciudad de Colombia: REVTILE asume el
   despacho completo. Sin recargos ni excepciones. */
const ENVIO = 0;
const ENVIO_LISTA = 20000; // lo que costaría por transportadora: se muestra tachado
const COMBO_POR_PAR = 10000;         // descuento por cada PAR de tarros (2, 4, 6…)
const LLAVE_BREB = '0092968559';
const WHATSAPP = '573214569600';
const HORAS_ENTREGA = ['9:00 a.m.', '10:00 a.m.', '11:00 a.m.', '12:00 m.', '1:00 p.m.', '2:00 p.m.', '3:00 p.m.', '4:00 p.m.', '5:00 p.m.', '6:00 p.m.'];

const $ = (id) => document.getElementById(id);
/* El boton de pagar existe dos veces: en el resumen fijo de escritorio y en
   la barra inferior de movil. Los dos dicen y hacen lo mismo. */
const textoPagar = (t) => document.querySelectorAll('.pagar-txt').forEach((e) => { e.textContent = t; });
const fmt = (n) => '$' + n.toLocaleString('es-CO');

const state = {
  cant: { on: 1, mt: 0, on120: 0 },
  pago: 'anticipado',                // 'anticipado' | 'contraentrega'
  dia: null, diaISO: null, hora: '', // entrega programada (solo Bogotá + anticipado)
  cupon: null,                       // {codigo, tipo, valor} validado por la API
  lat: null, lng: null, dirMapa: null,
};

/* --- Blindaje anti-fallos --- */
const ENVIO_COOLDOWN_MS = 20000;      // minimo entre pedidos distintos
const IDEMPOTENCIA_MS = 10 * 60000;   // mismo pedido en <10 min => mismo ID, sin duplicar registro
let enviando = false;
let ultimoEnvioTs = 0;

function hashPedido(nombre, tel, dir, total) {
  return JSON.stringify([state.cant, state.pago, state.diaISO, state.hora, state.cupon && state.cupon.codigo, nombre, tel, dir, total]);
}

function pedidoPrevio(hash) {
  try {
    const p = JSON.parse(sessionStorage.getItem('revtile_ultimo_pedido'));
    if (p && p.hash === hash && Date.now() - p.ts < IDEMPOTENCIA_MS) return p;
  } catch (e) { /* nada */ }
  return null;
}

function recordarPedido(hash, id) {
  try { sessionStorage.setItem('revtile_ultimo_pedido', JSON.stringify({ hash, id, ts: Date.now() })); } catch (e) { /* nada */ }
}

function abrirWhatsApp(url) {
  const w = window.open(url, '_blank');
  if (!w) location.href = url; // popup bloqueado: misma pestana
}

/* --- Producto preseleccionado por URL (?producto=mt) --- */
function aplicarParamProducto() {
  const param = new URLSearchParams(location.search).get('producto');
  if (param && PRODUCTOS[param]) {
    Object.keys(state.cant).forEach((k) => { state.cant[k] = 0; });
    state.cant[param] = 1;
  }
}
aplicarParamProducto();

/* al restaurar desde el caché de atrás/adelante, releer la URL y re-pintar */
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  aplicarParamProducto();
  render();
});

/* --- Steppers de cantidad por producto --- */
document.querySelectorAll('.co__prod').forEach((card) => {
  const prod = card.dataset.prod;
  card.querySelector('.co__step-minus').addEventListener('click', () => {
    state.cant[prod] = Math.max(0, state.cant[prod] - 1);
    render();
  });
  card.querySelector('.co__step-plus').addEventListener('click', () => {
    state.cant[prod] = Math.min(10, state.cant[prod] + 1);
    render();
  });
});

/* --- Campos condicionales --- */
$('fCiudad').addEventListener('change', () => {
  $('fOtraCiudadWrap').hidden = $('fCiudad').value !== 'nacional';
  render();
});

$('fVivienda').addEventListener('change', () => {
  const esApto = $('fVivienda').value !== 'casa';
  $('fAptoWrap').hidden = !esApto;
  $('fPorteriaWrap').hidden = !esApto;
});

/* --- Método de pago (tarjetas) --- */
document.querySelectorAll('.co__metodo').forEach((card) => {
  card.addEventListener('click', () => {
    state.pago = card.dataset.pago;
    render();
  });
});

/* --- Cupón de descuento --- */
let cuponOcupado = false;
$('btnCupon').addEventListener('click', async () => {
  if (cuponOcupado) return;
  const codigo = $('fCupon').value.trim().toUpperCase();
  const msg = $('cuponMsg');
  if (state.cupon) { // ya hay uno: el botón funciona como "quitar"
    state.cupon = null;
    $('fCupon').value = '';
    $('fCupon').disabled = false;
    $('btnCupon').textContent = 'Aplicar';
    msg.hidden = true;
    render();
    return;
  }
  if (!/^[A-Z0-9]{3,20}$/.test(codigo)) {
    msg.hidden = false; msg.className = 'co__cupon-msg is-mal'; msg.textContent = 'Escribe un código válido (sin espacios).';
    return;
  }
  cuponOcupado = true;
  $('btnCupon').textContent = '…';
  try {
    const { subtotal, combo } = calcular();
    const r = await fetch(`/api/cupon?codigo=${encodeURIComponent(codigo)}&total=${subtotal - combo}`);
    const data = await r.json();
    if (data.ok) {
      state.cupon = { codigo: data.codigo, tipo: data.tipo, valor: data.valor };
      $('fCupon').disabled = true;
      $('btnCupon').textContent = 'Quitar';
      msg.hidden = false; msg.className = 'co__cupon-msg is-bien';
      msg.textContent = `🎟 ¡Cupón ${data.codigo} aplicado! Ahorras ${fmt(data.descuento)}.`;
    } else {
      $('btnCupon').textContent = 'Aplicar';
      msg.hidden = false; msg.className = 'co__cupon-msg is-mal'; msg.textContent = data.error || 'Ese cupón no sirve.';
    }
  } catch (e) {
    $('btnCupon').textContent = 'Aplicar';
    msg.hidden = false; msg.className = 'co__cupon-msg is-mal'; msg.textContent = 'No pudimos validar el cupón — intenta de nuevo.';
  }
  cuponOcupado = false;
  render();
});
$('fCupon').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnCupon').click(); });

/* --- Entrega programada: días (Lun–Sáb) y hora --- */
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function construirAgenda() {
  const cont = $('coDias');
  if (!cont) return;
  cont.innerHTML = '';
  const hoy = new Date();
  let d = new Date(hoy);
  let creados = 0;
  let manana = true;
  while (creados < 6) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) { manana = false; continue; } // domingos no
    const etiqueta = `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // fecha local, no UTC
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'co__dia';
    chip.innerHTML = `<small>${manana ? 'Mañana' : DIAS_CORTOS[d.getDay()].toUpperCase()}</small><b>${d.getDate()} ${MESES_CORTOS[d.getMonth()]}</b>`;
    chip.dataset.etiqueta = etiqueta;
    chip.dataset.iso = iso;
    chip.addEventListener('click', () => {
      state.dia = etiqueta;
      state.diaISO = iso;
      cont.querySelectorAll('.co__dia').forEach((c) => c.classList.toggle('is-active', c === chip));
    });
    cont.appendChild(chip);
    if (creados === 0) { chip.classList.add('is-active'); state.dia = etiqueta; state.diaISO = iso; } // primer día preseleccionado
    creados++;
    manana = false;
  }
  const selHora = $('fHora');
  HORAS_ENTREGA.forEach((h) => {
    const op = document.createElement('option');
    op.value = h;
    op.textContent = h;
    selHora.appendChild(op);
  });
  selHora.addEventListener('change', () => { state.hora = selHora.value; });
}
construirAgenda();

/* --- Totales --- */
function calcular() {
  let subtotal = 0;
  let tarros = 0;
  const items = [];
  let lista = 0; // lo que costaría a precio de lista, para mostrar el ahorro
  for (const [k, c] of Object.entries(state.cant)) {
    if (c > 0) {
      subtotal += PRODUCTOS[k].precio * c;
      lista += PRODUCTOS[k].precio_antes * c;
      tarros += c;
      items.push({ k, c, nombre: PRODUCTOS[k].nombre, corto: PRODUCTOS[k].corto, valor: PRODUCTOS[k].precio * c, valorLista: PRODUCTOS[k].precio_antes * c });
    }
  }
  const pares = Math.floor(tarros / 2);
  const combo = pares * COMBO_POR_PAR;
  const esBogota = $('fCiudad').value === 'bogota';
  const esCE = state.pago === 'contraentrega';
  const envio = ENVIO;
  const programado = esBogota && !esCE; // entrega con día y hora a elección
  /* cupón: se recalcula sobre subtotal − combo (el servidor re-valida al registrar) */
  let descuento = 0;
  if (state.cupon) {
    const base = subtotal - combo;
    descuento = state.cupon.tipo === 'porcentaje'
      ? Math.round((base * state.cupon.valor) / 100)
      : Math.min(state.cupon.valor, base);
  }
  const ahorro = (lista - subtotal) + combo + descuento + ENVIO_LISTA;
  return { items, tarros, subtotal, lista, ahorro, pares, combo, esBogota, esCE, programado, envio, descuento, total: subtotal - combo - descuento + envio };
}

function render() {
  const { items, tarros, subtotal, lista, ahorro, pares, combo, esBogota, esCE, programado, envio, descuento, total } = calcular();

  document.querySelectorAll('.co__prod').forEach((card) => {
    const c = state.cant[card.dataset.prod];
    card.querySelector('.co__step-val').textContent = c;
    card.classList.toggle('is-active', c > 0);
  });

  $('coCombo').hidden = combo === 0;
  if (combo > 0) {
    $('coComboTxt').textContent = `Combo Gymbro aplicado: −${fmt(combo)} (${pares} par${pares > 1 ? 'es' : ''} de tarros)`;
  }

  /* tarjetas de método */
  document.querySelectorAll('.co__metodo').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.pago === state.pago);
  });
  $('mAntDetalle').textContent = esBogota
    ? 'Envío gratis y tú eliges el día y la hora de la entrega.'
    : 'Envío gratis a tu ciudad. Sale el mismo día.';
  $('mCEDetalle').textContent = esBogota
    ? 'Pagas al recibir · entrega en 2-3 días hábiles · envío GRATIS'
    : 'Pagas al recibir. 2 a 3 días hábiles, con envío gratis.';

  /* agenda de entrega programada */
  $('coProg').hidden = !programado;

  /* bloques de pago */
  $('payAnticipado').hidden = esCE;
  $('payCE').hidden = !esCE;
  $('btnEnviar').textContent = esCE
    ? 'Confirmar mi pedido contraentrega por WhatsApp'
    : 'Ya pagué → Enviar mi pedido por WhatsApp';
  textoPagar(esCE ? 'Confirmar pedido ↓' : 'Ir a pagar ↓');
  $('coNota').innerHTML = esCE
    ? 'Tu pedido queda <b>registrado con un número único</b> y se abre WhatsApp para confirmarlo. Pagas cuando lo recibas en tu puerta.'
    : 'Tu pedido queda <b>registrado con un número único</b> en nuestro sistema y se abre WhatsApp para que adjuntes el comprobante. Verificamos y sale el mismo día.';

  /* factura */
  $('resItems').innerHTML = items.length
    ? items.map((i) => `<p><span><b class="co__cant">${i.c}×</b> ${i.nombre}</span><span class="co__precios"><s>${fmt(i.valorLista)}</s> <b>${fmt(i.valor)}</b></span></p>`).join('')
    : '<p><span>Elige al menos un tarro</span><b>—</b></p>';
  $('resComboLine').hidden = combo === 0;
  $('resComboVal').textContent = '−' + fmt(combo);
  $('resCuponLine').hidden = descuento === 0;
  if (descuento > 0) {
    $('resCuponTxt').textContent = 'Cupón ' + state.cupon.codigo;
    $('resCuponVal').textContent = '−' + fmt(descuento);
  }
  $('resEnvio').innerHTML = envio === 0
    ? `<s>${fmt(ENVIO_LISTA)}</s> <span class="co__verde">GRATIS</span>`
    : fmt(envio);
  $('resAhorroLine').hidden = !items.length;
  $('resAhorroVal').textContent = '−' + fmt(ahorro);
  $('resTotalLista').textContent = fmt(lista + ENVIO_LISTA); /* lo que costaría a precio de lista con envío */
  $('resTotalLista').hidden = !items.length;
  $('resTotal').textContent = fmt(total);
  $('barTotal').textContent = fmt(total);
}

/* --- Mapa (OpenStreetMap + Leaflet, pin arrastrable) --- */
const BOGOTA = [4.6482, -74.0779];
let mapa = null;
let pin = null;

try {
  mapa = L.map('coMap', { scrollWheelZoom: false }).setView(BOGOTA, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa);

  // pin propio (divIcon): sin imágenes externas, no depende de la CSP
  const iconoPin = L.divIcon({
    className: 'co__pin',
    html: '<div class="co__pin-dot"></div><div class="co__pin-punta"></div>',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });

  pin = L.marker(BOGOTA, { draggable: true, icon: iconoPin }).addTo(mapa);
  pin.on('dragend', () => {
    const pos = pin.getLatLng();
    state.lat = pos.lat.toFixed(6);
    state.lng = pos.lng.toFixed(6);
    $('mapHint').textContent = '📍 Punto de entrega ajustado — irá en tu pedido.';
    direccionDelPin(state.lat, state.lng);
  });
  /* Leaflet pinta gris si mide el mapa antes de que el layout termine */
  setTimeout(() => mapa.invalidateSize(), 400);
  window.addEventListener('load', () => setTimeout(() => mapa.invalidateSize(), 100));
} catch (e) {
  document.querySelector('.co__map-block').hidden = true; // si el mapa falla, el pedido sigue funcionando
}

/* normaliza nomenclatura colombiana para que el buscador la entienda:
   quita apto/torre/interior (no geocodifican), expande abreviaturas y
   deja la placa pegada (52-59) */
function normalizarDireccion(d) {
  return d
    .split(',')[0]
    .replace(/\b(apto|apt|apartamento|torre|int|interior|bloque|blq|piso|of|oficina|local|manzana|mz|conjunto|edificio|ed|casa)\b\.?[\s\S]*$/gi, ' ')
    .replace(/[#º°]/g, ' ')
    .replace(/\bn(o|ro|um|úm)?\.?(?=\s|\d)/gi, ' ')
    .replace(/\bav(?:enida)?\.?\s*(?:cra|kra|kr|cr|k)\.?(?=\s|\d)|\bak\.?(?=\s|\d)/gi, 'Avenida Carrera')
    .replace(/\bav(?:enida)?\.?\s*(?:cll|cl)\.?(?=\s|\d)|\bac\.?(?=\s|\d)/gi, 'Avenida Calle')
    .replace(/\b(cra|kra|kr|cr)\b\.?/gi, 'Carrera')
    .replace(/\b(cll|cl)\b\.?/gi, 'Calle')
    .replace(/\b(av|avda)\b\.?/gi, 'Avenida')
    .replace(/\b(tv|tranv|transv|trans)\b\.?/gi, 'Transversal')
    .replace(/\b(dg|diag)\b\.?/gi, 'Diagonal')
    .replace(/(\d)\s*-\s*(\d)/g, '$1-$2')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pedirJson(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}
const esperar = (ms) => new Promise((res) => setTimeout(res, ms));

async function buscarNominatim(q, extra) {
  const data = await pedirJson('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&addressdetails=1&'
    + (extra || 'q=' + encodeURIComponent(q)));
  if (!data || !data.length) return null;
  return { lat: +data[0].lat, lon: +data[0].lon, casa: !!(data[0].address && data[0].address.house_number) };
}

/* segundo motor (Photon/OSM): entiende mejor las vías con letra (53C, 68D Sur) */
async function buscarPhoton(q) {
  const c = mapa ? mapa.getCenter() : { lat: BOGOTA[0], lng: BOGOTA[1] };
  const data = await pedirJson('https://photon.komoot.io/api/?limit=1&lang=es&lat=' + c.lat + '&lon=' + c.lng + '&q=' + encodeURIComponent(q));
  const f = data && data.features && data.features[0];
  if (!f || (f.properties && f.properties.countrycode && f.properties.countrycode !== 'CO')) return null;
  return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], casa: !!(f.properties && f.properties.housenumber) };
}

/* de la búsqueda más exacta a la más amplia; devuelve también qué tan fina fue */
async function geocodificar(norm, ciudad) {
  const zona = ciudad + ', Colombia';
  const sinPlaca = norm.replace(/(\d+[a-z]?)\s*-\s*\d+\s*$/i, '$1').trim();
  const via = norm.match(/^(Avenida Carrera|Avenida Calle|Carrera|Calle|Avenida|Transversal|Diagonal)\s+(\d+\s?[a-z]?(?:\s?(?:bis|sur|norte|este|oeste))*)\s+(.+)$/i);

  const rondas = [];
  if (via) {
    /* consulta estructurada: numero de casa + via, la que mejor da en el clavo */
    rondas.push({ extra: 'street=' + encodeURIComponent(via[3] + ' ' + via[1] + ' ' + via[2]) + '&city=' + encodeURIComponent(ciudad) + '&country=Colombia' });
  }
  rondas.push({ q: norm + ', ' + zona });
  if (sinPlaca !== norm) rondas.push({ q: sinPlaca + ', ' + zona });

  for (const ronda of rondas) {
    const hit = await buscarNominatim(ronda.q, ronda.extra);
    if (hit) return { ...hit, zoom: hit.casa ? 18 : 16 };
    await esperar(400); /* cortesía con Nominatim: ~1 consulta por segundo */
  }

  try {
    const photon = await buscarPhoton(norm + ' ' + ciudad);
    if (photon) return { ...photon, zoom: photon.casa ? 18 : 16 };
  } catch (e) { /* sin Photon: seguimos */ }

  /* al menos la vía completa, sin placa, para centrar la calle */
  if (via) {
    const hitVia = await buscarNominatim(via[1] + ' ' + via[2] + ', ' + zona);
    if (hitVia) return { ...hitVia, casa: false, zoom: 15, aprox: true };
  }
  /* último recurso: centrar la ciudad para poner el pin a mano */
  const hitCiudad = await buscarNominatim(zona);
  if (hitCiudad) return { ...hitCiudad, casa: false, zoom: 13, soloCiudad: true };
  return null;
}

/* direccion que el mapa reconoce en el punto del pin (para corroborar) */
async function direccionDelPin(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`);
    const data = await r.json();
    if (data && data.address) {
      const a = data.address;
      const partes = [
        [a.road, a.house_number].filter(Boolean).join(' '),
        a.neighbourhood || a.suburb,
        a.city || a.town || a.municipality,
      ].filter(Boolean);
      state.dirMapa = partes.join(', ');
      $('mapDir').hidden = false;
      $('mapDir').innerHTML = '🗺 Según el mapa, el pin está en: <b>' + state.dirMapa + '</b> — si no coincide con tu dirección, ajusta el pin.';
    }
  } catch (e) { /* sin reverse: no pasa nada */ }
}

let geoOcupado = false;
$('btnGeo').addEventListener('click', async () => {
  if (!mapa || geoOcupado) return;
  const dir = $('fDir').value.trim();
  const ciudad = ($('fCiudad').value === 'bogota' ? 'Bogotá' : $('fOtraCiudad').value.trim()) || 'Bogotá';
  if (!dir) return mostrarError('Escribe primero tu dirección para ubicarla en el mapa.');
  geoOcupado = true;
  $('btnGeo').textContent = 'Buscando…';
  try {
    const hit = await geocodificar(normalizarDireccion(dir), ciudad);
    if (hit) {
      mapa.setView([hit.lat, hit.lon], hit.zoom);
      pin.setLatLng([hit.lat, hit.lon]);
      state.lat = hit.lat.toFixed(6);
      state.lng = hit.lon.toFixed(6);
      $('mapHint').textContent = hit.soloCiudad
        ? 'No dimos con la dirección exacta, pero centramos tu ciudad: pon el pin en tu punto — el pedido sirve igual.'
        : hit.aprox
          ? '📍 Encontramos tu calle — desliza el pin hasta tu puerta.'
          : hit.casa
            ? '📍 Dirección encontrada — arrastra el pin si hay que afinarlo.'
            : '📍 Te dejamos muy cerca — arrastra el pin hasta tu puerta exacta.';
      if (!hit.soloCiudad) direccionDelPin(state.lat, state.lng);
    } else {
      $('mapHint').textContent = 'No encontramos esa dirección — acerca el mapa y pon el pin a mano en tu punto (el pedido sirve igual).';
    }
  } catch (e) {
    $('mapHint').textContent = 'No se pudo buscar — mueve el pin a mano hasta tu punto.';
  }
  $('btnGeo').textContent = 'Ubicar en el mapa';
  geoOcupado = false;
});

/* --- Usar la ubicación del dispositivo: en el celular es un solo toque --- */
$('btnGps').addEventListener('click', () => {
  if (!mapa) return;
  if (!navigator.geolocation) return mostrarError('Tu navegador no permite compartir la ubicación — busca la dirección o pon el pin a mano.');
  $('btnGps').textContent = 'Ubicando…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      mapa.setView([latitude, longitude], 17);
      pin.setLatLng([latitude, longitude]);
      state.lat = latitude.toFixed(6);
      state.lng = longitude.toFixed(6);
      $('mapHint').textContent = accuracy > 120
        ? '📍 Ubicación aproximada — arrastra el pin hasta tu puerta.'
        : '📍 Este es tu punto — ajusta el pin si hace falta.';
      direccionDelPin(state.lat, state.lng);
      $('btnGps').textContent = 'Usar mi ubicación';
    },
    () => {
      $('btnGps').textContent = 'Usar mi ubicación';
      mostrarError('No pudimos leer tu ubicación — busca la dirección o pon el pin a mano.');
    },
    { enableHighAccuracy: true, timeout: 9000 }
  );
});

/* --- Copiar llave Bre-B --- */
async function copiarLlave() {
  try {
    await navigator.clipboard.writeText(LLAVE_BREB);
    $('llaveEstado').textContent = '¡Copiada! ✓';
    setTimeout(() => { $('llaveEstado').textContent = 'Copiar llave'; }, 2500);
    return true;
  } catch (e) {
    $('llaveEstado').textContent = LLAVE_BREB;
    return false;
  }
}

$('btnLlave').addEventListener('click', copiarLlave);

const btnPagarResumen = $('btnIrPagarResumen');
if (btnPagarResumen) btnPagarResumen.addEventListener('click', () => $('btnIrPagar').click());

/* --- Barra fija: anticipado copia la llave y baja al pago; contraentrega baja a confirmar --- */
$('btnIrPagar').addEventListener('click', async () => {
  if (state.pago === 'contraentrega') {
    $('btnEnviar').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const ok = await copiarLlave();
  textoPagar(ok ? 'Llave copiada ✓ — pégala en tu app' : 'Ir a pagar');
  document.getElementById('pago').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { textoPagar('Ir a pagar ↓'); }, 3500);
});

/* --- Perfil recordado (solo en este navegador) --- */
const PERFIL_KEY = 'revtile_perfil';

function cargarPerfil() {
  try {
    const p = JSON.parse(localStorage.getItem(PERFIL_KEY));
    if (!p) return;
    $('fNombre').value = p.nombre || '';
    $('fTel').value = p.tel || '';
    $('fCiudad').value = p.ciudad || 'bogota';
    $('fOtraCiudad').value = p.otraCiudad || '';
    $('fOtraCiudadWrap').hidden = $('fCiudad').value !== 'nacional';
    $('fDir').value = p.dir || '';
    $('fVivienda').value = p.vivienda || 'casa';
    $('fApto').value = p.apto || '';
    $('fPorteria').checked = !!p.porteria;
    $('fVivienda').dispatchEvent(new Event('change'));
    $('coSaved').hidden = false;
  } catch (e) { /* perfil corrupto: ignorar */ }
}

function guardarPerfil() {
  localStorage.setItem(PERFIL_KEY, JSON.stringify({
    nombre: $('fNombre').value.trim(),
    tel: $('fTel').value.trim(),
    ciudad: $('fCiudad').value,
    otraCiudad: $('fOtraCiudad').value.trim(),
    dir: $('fDir').value.trim(),
    vivienda: $('fVivienda').value,
    apto: $('fApto').value.trim(),
    porteria: $('fPorteria').checked,
  }));
}

$('coClear').addEventListener('click', () => {
  localStorage.removeItem(PERFIL_KEY);
  location.reload();
});

/* --- Validación y envío --- */
function mostrarError(msg) {
  const el = $('coError');
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { el.hidden = true; }, 6000);
}

$('btnEnviar').addEventListener('click', async () => {
  const { items, tarros, subtotal, combo, pares, esBogota, esCE, programado, envio, descuento, total } = calcular();
  const nombre = $('fNombre').value.trim();
  const tel = $('fTel').value.trim();
  const dir = $('fDir').value.trim();
  const ciudad = esBogota ? 'Bogotá' : $('fOtraCiudad').value.trim();

  if (tarros === 0) return mostrarError('Elige al menos un tarro (paso 01).');
  if (!nombre) return mostrarError('Falta tu nombre completo (paso 02).');
  if (!/^3\d{9}$/.test(tel.replace(/\D/g, ''))) return mostrarError('Revisa tu número de WhatsApp: deben ser 10 dígitos empezando por 3.');
  if (!ciudad) return mostrarError('Falta la ciudad (paso 02).');
  if (!dir) return mostrarError('Falta la dirección de entrega (paso 02).');
  if (programado && !state.hora) return mostrarError('Elige la hora de tu entrega programada (paso 04) ⚡');

  guardarPerfil();

  const vivienda = $('fVivienda').value;
  const apto = $('fApto').value.trim();
  const porteria = $('fPorteria').checked;
  const mapsLink = state.lat ? `https://www.google.com/maps?q=${state.lat},${state.lng}` : '';

  /* candado: nunca dos envios en paralelo */
  if (enviando) return;

  /* idempotencia: mismo pedido repetido => mismo ID, sin duplicar el registro */
  const hash = hashPedido(nombre, tel, dir, total);
  const previo = pedidoPrevio(hash);
  if (previo) {
    $('coOk').hidden = false;
    $('coOk').textContent = `✅ Este pedido ya estaba registrado como ${previo.id} — te reabrimos WhatsApp.`;
    const txtPrevio = esCE
      ? `🦎 *PEDIDO REVTILE ${previo.id}* (contraentrega)\n\n*Total a pagar al recibir: ${fmt(total)}*\n👤 ${nombre}\n\nConfirmo mi pedido 👇`
      : `🦎 *PEDIDO REVTILE ${previo.id}*\n\n*Total pagado: ${fmt(total)}* (Bre-B ${LLAVE_BREB})\n👤 ${nombre}\n\nAdjunto mi comprobante de pago 👇`;
    abrirWhatsApp('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(txtPrevio));
    return;
  }

  /* enfriamiento entre pedidos distintos (frena bots y clics compulsivos) */
  if (Date.now() - ultimoEnvioTs < ENVIO_COOLDOWN_MS) {
    return mostrarError('Acabas de enviar un pedido — espera unos segundos antes de enviar otro.');
  }

  /* ID unico de pedido: RV- + fecha base36 + azar (ej. RV-K8M2X) */
  const id = 'RV-' + (Date.now().toString(36).slice(-3) + Math.random().toString(36).slice(2, 4)).toUpperCase();

  enviando = true;
  const boton = $('btnEnviar');
  boton.disabled = true;
  boton.textContent = 'Registrando tu pedido…';

  /* registro del pedido en nuestro sistema (API propia + D1), con timeout de 6 s */
  let registrado = false;
  try {
    const cortar = new AbortController();
    const timer = setTimeout(() => cortar.abort(), 6000);
    const r = await fetch('/api/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: cortar.signal,
      body: JSON.stringify({
        id,
        web: $('fWeb') ? $('fWeb').value : '', // honeypot
        metodo_pago: esCE ? 'contraentrega' : 'anticipado',
        entrega_dia: programado ? state.diaISO : null,
        entrega_hora: programado ? state.hora : null,
        items: items.map((i) => ({ k: i.k, c: i.c, nombre: i.nombre, valor: i.valor })),
        subtotal,
        combo,
        cupon: state.cupon ? state.cupon.codigo : null,
        envio,
        total,
        nombre,
        telefono: tel.replace(/\D/g, ''),
        ciudad,
        direccion: dir,
        vivienda,
        apto,
        porteria,
        direccion_mapa: state.dirMapa || '',
        lat: state.lat,
        lng: state.lng,
      }),
    });
    clearTimeout(timer);
    registrado = r.ok;
  } catch (e) { registrado = false; }

  enviando = false;
  ultimoEnvioTs = Date.now();
  recordarPedido(hash, id);
  boton.disabled = false;

  const lineaEntrega = programado
    ? `📦 Entrega programada: *${state.dia} · ${state.hora}*`
    : '📦 Entrega en 2-3 días hábiles';
  const lineaTotal = esCE
    ? `▪ *Total a pagar al recibir: ${fmt(total)}* (contraentrega)`
    : `▪ *Total pagado: ${fmt(total)}* (Bre-B ${LLAVE_BREB})`;
  const cierre = esCE ? 'Confirmo mi pedido contraentrega ✅' : 'Adjunto mi comprobante de pago 👇';
  const lineaRastreo = `🔎 Sigue tu pedido: revtile.com.co/rastreo?id=${id}`;

  let lineas;
  if (registrado) {
    $('coOk').hidden = false;
    $('coOk').textContent = esCE
      ? `Pedido ${id} registrado. Confírmalo en WhatsApp y pagas al recibir.`
      : `Pedido ${id} registrado con todos tus datos. Ahora adjunta el comprobante en WhatsApp.`;
    lineas = [
      `🦎 *PEDIDO REVTILE ${id}*${esCE ? ' (contraentrega)' : ''}`,
      '',
      ...items.map((i) => `▪ ${i.c}× ${i.corto}`),
      ...(descuento ? [`▪ Cupón ${state.cupon.codigo}: −${fmt(descuento)}`] : []),
      lineaTotal,
      lineaEntrega,
      lineaRastreo,
      `👤 ${nombre}`,
      '',
      'Mi pedido quedó registrado con todos los datos ✅',
      cierre,
    ];
  } else {
    lineas = [`🦎 *PEDIDO REVTILE ${id}*${esCE ? ' (contraentrega)' : ''}`, ''];
    items.forEach((i) => lineas.push(`▪ ${i.c}× ${i.nombre} — ${fmt(i.valor)}`));
    if (combo) lineas.push(`▪ Combo Gymbro (${pares} par${pares > 1 ? 'es' : ''}): −${fmt(combo)}`);
    if (descuento) lineas.push(`▪ Cupón ${state.cupon.codigo}: −${fmt(descuento)}`);
    lineas.push(
      `▪ Envío ${ciudad}: ` + (envio === 0 ? 'GRATIS' : fmt(envio)),
      lineaTotal,
      lineaEntrega,
      '',
      `👤 ${nombre}`,
      `📱 ${tel}`,
      `📍 ${dir}, ${ciudad}`,
    );
    if (state.dirMapa) lineas.push(`🗺 Según el mapa: ${state.dirMapa}`);
    if (vivienda !== 'casa') {
      lineas.push(`🏢 ${vivienda === 'conjunto' ? 'Conjunto' : 'Apartamento'}${apto ? ' — ' + apto : ''}`);
      lineas.push(porteria ? '✅ Autorizo dejar en portería a mi nombre' : '🔔 Entregar en persona (no dejar en portería)');
    }
    if (mapsLink) lineas.push(`🗺 Punto exacto: ${mapsLink}`);
    lineas.push('', cierre);
  }

  boton.textContent = esCE ? 'Confirmar mi pedido contraentrega por WhatsApp' : 'Ya pagué → Enviar mi pedido por WhatsApp';

  if (typeof gtag === 'function') gtag('event', 'checkout_pedido', { tarros, total, registrado, metodo: esCE ? 'contraentrega' : 'anticipado' });

  abrirWhatsApp('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lineas.join('\n')));
});

/* --- Init --- */
cargarPerfil();
render();
