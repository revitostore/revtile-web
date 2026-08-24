/* ===== Checkout Revtile: pedido + pago Bre-B + envío por WhatsApp ===== */

/* --- Configuración (edita aquí precios y tarifas) --- */
const PRODUCTOS = {
  on: { nombre: 'ON Micronized Creatine 300 g', precio: 120000 },
  mt: { nombre: 'MT Platinum Creatine 400 g', precio: 140000 },
};
const ENVIO_BOGOTA = 0;
const ENVIO_NACIONAL = 18000;
const COMBO_DESCUENTO = 10000;   // al llevar 2+ tarros
const LLAVE_BREB = '0092968559';
const WHATSAPP = '573214569600';

const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + n.toLocaleString('es-CO');

const state = { prod: 'on', cant: 1, lat: null, lng: null };

/* --- Producto preseleccionado por URL (?producto=mt) --- */
function aplicarParamProducto() {
  const param = new URLSearchParams(location.search).get('producto');
  if (param && PRODUCTOS[param]) state.prod = param;
}
aplicarParamProducto();

/* al restaurar desde el caché de atrás/adelante, releer la URL y re-pintar */
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  aplicarParamProducto();
  document.querySelectorAll('.co__prod').forEach((b) => b.classList.toggle('is-active', b.dataset.prod === state.prod));
  render();
});

/* --- Selección de producto --- */
document.querySelectorAll('.co__prod').forEach((btn) => {
  btn.classList.toggle('is-active', btn.dataset.prod === state.prod);
  btn.addEventListener('click', () => {
    state.prod = btn.dataset.prod;
    document.querySelectorAll('.co__prod').forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  });
});

/* --- Cantidad --- */
$('qtyMinus').addEventListener('click', () => { state.cant = Math.max(1, state.cant - 1); render(); });
$('qtyPlus').addEventListener('click', () => { state.cant = Math.min(10, state.cant + 1); render(); });

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

/* --- Totales --- */
function calcular() {
  const p = PRODUCTOS[state.prod];
  const subtotal = p.precio * state.cant;
  const combo = state.cant >= 2 ? COMBO_DESCUENTO : 0;
  const envio = $('fCiudad').value === 'bogota' ? ENVIO_BOGOTA : ENVIO_NACIONAL;
  return { p, subtotal, combo, envio, total: subtotal - combo + envio };
}

function render() {
  const { p, subtotal, combo, envio, total } = calcular();
  $('qtyVal').textContent = state.cant;
  $('coCombo').hidden = combo === 0;
  $('resProducto').textContent = state.cant + '× ' + p.nombre;
  $('resSubtotal').textContent = fmt(subtotal);
  $('resComboLine').hidden = combo === 0;
  $('resEnvio').textContent = envio === 0 ? 'GRATIS' : fmt(envio);
  $('resTotal').textContent = fmt(total);
}

/* --- Mapa (OpenStreetMap + Leaflet, pin arrastrable) --- */
const BOGOTA = [4.6482, -74.0779];
const mapa = L.map('coMap', { scrollWheelZoom: false }).setView(BOGOTA, 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(mapa);

const pin = L.marker(BOGOTA, { draggable: true }).addTo(mapa);
pin.on('dragend', () => {
  const pos = pin.getLatLng();
  state.lat = pos.lat.toFixed(6);
  state.lng = pos.lng.toFixed(6);
  $('mapHint').textContent = '📍 Punto de entrega ajustado — irá en tu pedido.';
});

$('btnGeo').addEventListener('click', async () => {
  const dir = $('fDir').value.trim();
  const ciudad = $('fCiudad').value === 'bogota' ? 'Bogotá' : $('fOtraCiudad').value.trim();
  if (!dir) { mostrarError('Escribe primero tu dirección para ubicarla en el mapa.'); return; }
  $('btnGeo').textContent = 'Buscando…';
  try {
    const q = encodeURIComponent(dir + ', ' + (ciudad || 'Bogotá') + ', Colombia');
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + q);
    const data = await r.json();
    if (data.length) {
      const { lat, lon } = data[0];
      mapa.setView([lat, lon], 17);
      pin.setLatLng([lat, lon]);
      state.lat = parseFloat(lat).toFixed(6);
      state.lng = parseFloat(lon).toFixed(6);
      $('mapHint').textContent = '📍 ¿Quedó bien el pin? Arrástralo si hay que afinarlo.';
    } else {
      $('mapHint').textContent = 'No encontramos esa dirección — mueve el pin a mano hasta tu punto.';
    }
  } catch (e) {
    $('mapHint').textContent = 'No se pudo buscar — mueve el pin a mano hasta tu punto.';
  }
  $('btnGeo').textContent = 'Ubicar mi dirección en el mapa';
});

/* --- Copiar llave Bre-B --- */
$('btnLlave').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(LLAVE_BREB);
    $('llaveEstado').textContent = '¡Copiada! ✓';
  } catch (e) {
    $('llaveEstado').textContent = LLAVE_BREB;
  }
  setTimeout(() => { $('llaveEstado').textContent = 'Copiar llave'; }, 2500);
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

$('btnEnviar').addEventListener('click', () => {
  const nombre = $('fNombre').value.trim();
  const tel = $('fTel').value.trim();
  const dir = $('fDir').value.trim();
  const esBogota = $('fCiudad').value === 'bogota';
  const ciudad = esBogota ? 'Bogotá' : $('fOtraCiudad').value.trim();

  if (!nombre) return mostrarError('Falta tu nombre completo (paso 02).');
  if (!/^3\d{9}$/.test(tel.replace(/\D/g, ''))) return mostrarError('Revisa tu número de WhatsApp: deben ser 10 dígitos empezando por 3.');
  if (!ciudad) return mostrarError('Falta la ciudad (paso 02).');
  if (!dir) return mostrarError('Falta la dirección de entrega (paso 02).');

  guardarPerfil();

  const { p, combo, envio, total } = calcular();
  const vivienda = $('fVivienda').value;
  const apto = $('fApto').value.trim();
  const porteria = $('fPorteria').checked;

  const lineas = [
    '🦎 *PEDIDO REVTILE*',
    '',
    `▪ ${state.cant}× ${p.nombre}`,
  ];
  if (combo) lineas.push('▪ Combo Gymbro: −' + fmt(combo));
  lineas.push(
    `▪ Envío ${ciudad}: ` + (envio === 0 ? 'GRATIS' : fmt(envio)),
    `▪ *Total pagado: ${fmt(total)}* (Bre-B ${LLAVE_BREB})`,
    '',
    `👤 ${nombre}`,
    `📱 ${tel}`,
    `📍 ${dir}, ${ciudad}`,
  );
  if (vivienda !== 'casa') {
    lineas.push(`🏢 ${vivienda === 'conjunto' ? 'Conjunto' : 'Apartamento'}${apto ? ' — ' + apto : ''}`);
    lineas.push(porteria ? '✅ Autorizo dejar en portería a mi nombre' : '🔔 Entregar en persona (no dejar en portería)');
  }
  if (state.lat) lineas.push(`🗺 Punto exacto: https://www.google.com/maps?q=${state.lat},${state.lng}`);
  lineas.push('', 'Adjunto mi comprobante de pago 👇');

  if (typeof gtag === 'function') gtag('event', 'checkout_pedido', { producto: state.prod, cantidad: state.cant, total });

  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lineas.join('\n')), '_blank');
});

/* --- Init --- */
cargarPerfil();
render();
