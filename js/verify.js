/* ===== REVTILE VERIFY — pantalla pública =====
   Consulta el registro de una unidad. Nunca dibuja nada que no venga del
   servidor: si la consulta falla, se dice, no se rellena. */
(function () {
  'use strict';

  var form = document.getElementById('verifyForm');
  var input = document.getElementById('verifyCodigo');
  var msg = document.getElementById('verifyMsg');
  var out = document.getElementById('verifyResultado');
  var ejemplo = document.getElementById('verifyEjemplo');
  if (!form || !input || !out) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var fecha = function (s) {
    if (!s) return null;
    var d = new Date(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return esc(s);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  /* mismo saneado que en el servidor, para no molestar con guiones */
  var normalizar = function (v) {
    var s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
    var limpio = s.replace(/^RV-?/, '').replace(/-/g, '')
      .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/U/g, 'V');
    return limpio.length === 9 ? 'RV-' + limpio.slice(0, 5) + '-' + limpio.slice(5) : s;
  };

  var aviso = function (texto) {
    msg.textContent = texto;
    msg.hidden = !texto;
  };

  function fila(k, v, ok) {
    if (!v) return '';
    return '<div class="verify__row"><span class="verify__k">' + esc(k) +
      '</span><span class="verify__v' + (ok ? ' ok' : '') + '">' + esc(v) + '</span></div>';
  }

  function pintar(r) {
    var anulado = r.estado === 'anulado';
    var fotos = (r.fotos || []).map(function (src, i) {
      return '<img src="' + esc(src) + '" alt="Fotografía ' + (i + 1) + ' del tarro tomada antes del despacho" loading="lazy">';
    }).join('');

    out.innerHTML =
      '<article class="verify__card">' +
        '<div class="verify__head">' +
          '<span class="verify__state' + (anulado ? ' verify__state--void' : '') + '">' +
            (anulado ? 'Registro anulado' : 'Registro activo') + '</span>' +
          '<p class="verify__code">' + esc(r.codigo) + '</p>' +
          '<p style="color:var(--ink-dim);font-size:14px">' + esc(r.producto) +
            (r.presentacion ? ' · ' + esc(r.presentacion) : '') + '</p>' +
        '</div>' +
        (anulado && r.motivo_anulacion
          ? '<div class="verify__rows">' + fila('Motivo de la anulación', r.motivo_anulacion) + '</div>'
          : '') +
        '<div class="verify__rows">' +
          fila('Sello de fábrica',
               r.sello === 'integro' ? 'Íntegro al inspeccionar' : 'Con observaciones',
               r.sello === 'integro') +
          fila('Observaciones', r.sello_nota) +
          fila('Lote impreso', r.lote) +
          fila('Vence', r.vence) +
          fila('Inspeccionado', fecha(r.inspeccionado_en)) +
          fila('Despachado', fecha(r.despachado_en)) +
        '</div>' +
        (fotos ? '<div class="verify__photos">' + fotos + '</div>' : '') +
        '<div class="verify__scope">' +
          '<b>Qué significa este registro</b>' +
          'REVTILE fotografió y anotó el estado observable de este tarro antes de despacharlo: el sello, el número de lote, la fecha de vencimiento y el estado del envase.' +
          '<br><br><b>Qué no significa</b>' +
          'REVTILE no es un laboratorio ni una entidad certificadora. Una inspección visual no reemplaza la verificación con el fabricante ni un análisis de laboratorio. Publicamos el lote y la fecha precisamente para que la verificación la puedas hacer tú con la marca.' +
          '<br><br><a class="link" href="https://wa.me/573214569600?text=' +
            encodeURIComponent('Hola REVTILE, escribo por el registro ' + r.codigo) +
            '" target="_blank" rel="noopener">Escribir por este tarro</a>' +
        '</div>' +
      '</article>';

    out.hidden = false;
    if (ejemplo) ejemplo.hidden = true;
  }

  function consultar(codigo) {
    aviso('Consultando…');
    out.hidden = true;
    fetch('/api/verify?codigo=' + encodeURIComponent(codigo))
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (res) {
        if (res.d && res.d.ok && res.d.registro) { aviso(''); pintar(res.d.registro); return; }
        if (res.s === 503) {
          aviso('La verificación no está disponible en este momento. Vuelve a intentarlo en unos minutos o escríbenos por WhatsApp.');
        } else {
          aviso('No encontramos ningún registro con ese código. Revisa que esté copiado tal cual aparece en el sticker.');
        }
        if (ejemplo) ejemplo.hidden = false;
      })
      .catch(function () {
        aviso('No pudimos conectar con el sistema. Revisa tu conexión y vuelve a intentarlo.');
        if (ejemplo) ejemplo.hidden = false;
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var codigo = normalizar(input.value);
    input.value = codigo;
    if (!/^RV-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{4}$/.test(codigo)) {
      aviso('El código tiene el formato RV-XXXXX-XXXX. Cópialo tal cual aparece en el sticker.');
      return;
    }
    history.replaceState(null, '', '?c=' + codigo);
    consultar(codigo);
  });

  /* ?c=RV-XXXXX-XXXX en la URL (es lo que abre el QR) */
  var inicial = new URLSearchParams(location.search).get('c');
  if (inicial) {
    var c = normalizar(inicial);
    input.value = c;
    consultar(c);
  }
})();
