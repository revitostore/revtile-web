/* ===== Checkout Revtile: pedido multi-producto + pago Bre-B + envío por WhatsApp ===== */

/* --- Configuración (edita aquí precios y tarifas) --- */
const PRODUCTOS = {
  on: { nombre: 'ON Micronized Creatine 300 g', corto: 'ON 300g', precio: 120000 },
  mt: { nombre: 'MT Platinum Creatine 400 g', corto: 'MT 400g', precio: 140000 },
  on120: { nombre: 'ON Micronized Creatine 600 g (120 serv.)', corto: 'ON 600g', precio: 170000 },
};
const ENVIO_BOGOTA = 0;
const ENVIO_BOGOTA_TACHADO = 20000;  // se muestra tachado para evidenciar el gratis
const ENVIO_NACIONAL = 18000;
const COMBO_POR_PAR = 10000;         // descuento por cada PAR de tarros (2, 4, 6…)
const LLAVE_BREB = '0092968559';
const WHATSAPP = '573214569600';

const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + n.toLocaleString('es-CO');

const state = { cant: { on: 1, mt: 0, on120: 0 }, lat: null, lng: null };

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

/* --- Totales --- */
function calcular() {
  let subtotal = 0;
  let tarros = 0;
  const items = [];
  for (const [k, c] of Object.entries(state.cant)) {
    if (c > 0) {
      subtotal += PRODUCTOS[k].precio * c;
      tarros += c;
      items.push({ k, c, nombre: PRODUCTOS[k].nombre, corto: PRODUCTOS[k].corto, valor: PRODUCTOS[k].precio * c });
    }
  }
  const pares = Math.floor(tarros / 2);
  const combo = pares * COMBO_POR_PAR;
  const esBogota = $('fCiudad').value === 'bogota';
  const envio = esBogota ? ENVIO_BOGOTA : ENVIO_NACIONAL;
  return { items, tarros, subtotal, pares, combo, esBogota, envio, total: subtotal - combo + envio };
}

function render() {
  const { items, tarros, subtotal, pares, combo, esBogota, envio, total } = calcular();

  document.querySelectorAll('.co__prod').forEach((card) => {
    const c = state.cant[card.dataset.prod];
    card.querySelector('.co__step-val').textContent = c;
    card.classList.toggle('is-active', c > 0);
  });

  $('coCombo').hidden = combo === 0;
  if (combo > 0) {
    $('coComboTxt').textContent = `Combo Gymbro aplicado: −${fmt(combo)} (${pares} par${pares > 1 ? 'es' : ''} de tarros)`;
  }

  $('resProducto').textContent = items.length
    ? items.map((i) => `${i.c}× ${i.corto}`).join(' + ')
    : 'Elige al menos un tarro';
  $('resSubtotal').textContent = fmt(subtotal);
  $('resComboLine').hidden = combo === 0;
  $('resComboVal').textContent = '−' + fmt(combo);
  $('resEnvio').innerHTML = esBogota
    ? `<s>${fmt(ENVIO_BOGOTA_TACHADO)}</s> <span class="co__verde">GRATIS</span>`
    : fmt(envio);
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
  });
} catch (e) {
  document.querySelector('.co__map-block').hidden = true; // si el mapa falla, el pedido sigue funcionando
}

$('btnGeo').addEventListener('click', async () => {
  if (!mapa) return;
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

/* --- Barra fija "Ir a pagar": copia la llave y baja directo al pago --- */
$('btnIrPagar').addEventListener('click', async () => {
  const ok = await copiarLlave();
  $('barPagarTxt').textContent = ok ? 'Llave copiada ✓ — pégala en tu app' : 'Ir a pagar';
  document.getElementById('pago').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { $('barPagarTxt').textContent = 'Ir a pagar ↓'; }, 3500);
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
  const { items, tarros, combo, pares, esBogota, envio, total } = calcular();
  const nombre = $('fNombre').value.trim();
  const tel = $('fTel').value.trim();
  const dir = $('fDir').value.trim();
  const ciudad = esBogota ? 'Bogotá' : $('fOtraCiudad').value.trim();

  if (tarros === 0) return mostrarError('Elige al menos un tarro (paso 01).');
  if (!nombre) return mostrarError('Falta tu nombre completo (paso 02).');
  if (!/^3\d{9}$/.test(tel.replace(/\D/g, ''))) return mostrarError('Revisa tu número de WhatsApp: deben ser 10 dígitos empezando por 3.');
  if (!ciudad) return mostrarError('Falta la ciudad (paso 02).');
  if (!dir) return mostrarError('Falta la dirección de entrega (paso 02).');

  guardarPerfil();

  const vivienda = $('fVivienda').value;
  const apto = $('fApto').value.trim();
  const porteria = $('fPorteria').checked;

  const lineas = ['🦎 *PEDIDO REVTILE*', ''];
  items.forEach((i) => lineas.push(`▪ ${i.c}× ${i.nombre} — ${fmt(i.valor)}`));
  if (combo) lineas.push(`▪ Combo Gymbro (${pares} par${pares > 1 ? 'es' : ''}): −${fmt(combo)}`);
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

  if (typeof gtag === 'function') gtag('event', 'checkout_pedido', { tarros, total });

  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lineas.join('\n')), '_blank');
});

/* --- Init --- */
cargarPerfil();
render();
