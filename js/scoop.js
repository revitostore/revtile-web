/* Llena el scoop: la ventana "Gana más descuento".
   Cualquier elemento con [data-scoop-abrir] abre la ventana (y solo se muestra si el servidor
   tiene el juego activo). Explica cómo ganar un descuento extra y contiene el juego:
     · Jugada del día: el servidor reparte las velocidades, el navegador solo mide cuándo frenas,
       y el servidor recalcula los gramos y emite el cupón. Una jugada por jugador y día.
     · Práctica: todo local, sin premio.
   El cupón ganado queda en localStorage (rev_cupon_scoop) y el pedido lo aplica solo. */
(function () {
  'use strict';

  var disparadores = Array.prototype.slice.call(document.querySelectorAll('[data-scoop-abrir]'));
  if (!disparadores.length || !window.fetch) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var LS = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  var fg = function (g, d) { return g.toFixed(d == null ? 3 : d).replace('.', ','); };

  var OBJ = 5, TOTAL = 3, DERRAME = 6;
  var reglas = { umbrales: { 5: 0.011, 3: 0.026, 1: 0.050 }, validezHoras: 48 };
  var activo = false;

  /* identificador anónimo del jugador (no es un dato personal) */
  function jugadorId() {
    var id = LS.get('rev_jugador');
    if (!id) {
      var a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      id = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      LS.set('rev_jugador', id);
    }
    return id;
  }
  var JUGADOR = jugadorId();

  function api(cuerpo) {
    return fetch('/api/scoop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ jugador: JUGADOR }, cuerpo)) })
      .then(function (r) { return r.json().then(function (d) { d.status = r.status; return d; }); });
  }
  function estado() {
    return fetch('/api/scoop?jugador=' + JUGADOR).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* ¿está activo el juego? Si no, los enlaces ni se muestran */
  estado().then(function (d) {
    if (!d || !d.ok || !d.activo) return;
    activo = true;
    if (d.reglas) reglas = d.reglas;
    disparadores.forEach(function (b) { b.hidden = false; });
  });

  /* ───────── la ventana ───────── */
  var dlg;
  function construir() {
    dlg = document.createElement('dialog');
    dlg.className = 'scoop';
    dlg.setAttribute('aria-labelledby', 'scoopT');
    dlg.innerHTML =
      '<div class="scoop__marco">' +
        '<button type="button" class="scoop__x" data-scoop-cerrar aria-label="Cerrar">×</button>' +
        '<p class="scoop__eyebrow">Gana más descuento</p>' +
        '<h2 class="scoop__titulo" id="scoopT">Llena el scoop<span>.</span></h2>' +
        '<p class="scoop__lead">Un descuento extra para tu maleta, sin condiciones de compra. Solo hace falta pulso.</p>' +
        '<ol class="scoop__reglas">' +
          '<li><span><b>Tres scoops.</b> Una jugada por día.</span></li>' +
          '<li><span><b>Frena el polvo al ras</b>, justo en la línea de los 5,000 g. Verás el número solo cuando frenes.</span></li>' +
          '<li><span><b>Se promedia tu error</b> de los tres scoops. Cuanto más fino, más descuento.</span></li>' +
        '</ol>' +
        '<div class="scoop__premios" id="scPremios"></div>' +
        '<p class="scoop__nota">Es muy difícil a propósito: el premio máximo es un 5 % y casi nadie lo logra. El cupón dura <span id="scValidez">48</span> h, es de un solo uso y se aplica solo en tu maleta.</p>' +
        '<div class="scoop__arena" id="scArena">' +
          '<div class="scoop__hud"><span id="scModo">Jugada del día</span><span id="scN">Scoop 1 de 3</span></div>' +
          '<div class="scoop__stage" id="scStage" role="button" tabindex="0" aria-label="Toca o presiona espacio para frenar el polvo">' +
            '<svg viewBox="0 0 400 262" role="img" aria-label="Scoop de medida en corte, con la línea de los 5 gramos al ras">' +
              '<defs><clipPath id="scCopa"><path d="M96 118 L276 118 C276 188 242 240 186 240 C130 240 96 188 96 118 Z"/></clipPath></defs>' +
              '<path d="M176 4 L198 4 L193 20 L181 20 Z" fill="#14140F"/>' +
              '<line id="scChorro" x1="187" y1="24" x2="187" y2="238" stroke="#14140F" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round" opacity="0"/>' +
              '<line x1="34" y1="118" x2="96" y2="118" stroke="#E31D36" stroke-width="2"/><path d="M82 111 L96 118 L82 125 Z" fill="#E31D36"/>' +
              '<text x="34" y="106" font-family="DM Mono,monospace" font-size="11" letter-spacing="1.6" fill="#43433C">5,000 G</text>' +
              '<path d="M96 118 L276 118 C276 188 242 240 186 240 C130 240 96 188 96 118 Z" fill="#fff"/>' +
              '<g clip-path="url(#scCopa)"><rect id="scPolvo" x="90" y="240" width="196" height="0" fill="#EFE9D6"/><line id="scSup" x1="90" x2="286" y1="240" y2="240" stroke="#14140F" stroke-width="1.5" opacity="0"/></g>' +
              '<path id="scMonton" d="" fill="#EFE9D6" stroke="#14140F" stroke-width="1.5" stroke-linejoin="round" opacity="0"/>' +
              '<path d="M96 118 L276 118 C276 188 242 240 186 240 C130 240 96 188 96 118 Z" fill="none" stroke="#14140F" stroke-width="2.5" stroke-linejoin="round"/>' +
              '<path d="M280 126 L352 100" fill="none" stroke="#14140F" stroke-width="13" stroke-linecap="round"/>' +
            '</svg>' +
            '<p class="scoop__ayuda" id="scAyuda"></p>' +
          '</div>' +
          '<div class="scoop__lect" aria-live="polite"><p class="scoop__num" id="scNum"></p><p class="scoop__err" id="scErr"></p></div>' +
          '<div class="scoop__pie"><div class="scoop__tres" id="scTres" aria-hidden="true"><i></i><i></i><i></i></div>' +
            '<div class="scoop__botones"><button type="button" class="scoop__btn scoop__btn--ghost" id="scPractica">Practicar sin premio</button><button type="button" class="scoop__btn" id="scJugar">Empezar la jugada del día</button></div></div>' +
        '</div>' +
        '<div class="scoop__res" id="scRes" hidden></div>' +
      '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-scoop-cerrar]')) cerrar(); });
    dlg.addEventListener('close', parar);
    $('#scJugar', dlg).addEventListener('click', jugarDelDia);
    $('#scPractica', dlg).addEventListener('click', practicar);
    $('#scStage', dlg).addEventListener('pointerdown', function (e) { e.preventDefault(); frenar(e.timeStamp); });
    dlg.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && J.estado === 'sube') { e.preventDefault(); frenar(e.timeStamp); } });
    var u = reglas.umbrales;
    $('#scPremios', dlg).innerHTML = [1, 3, 5].map(function (p) { return '<div><b>' + p + ' %</b><span>error medio menor que ' + fg(u[p]) + ' g</span></div>'; }).join('');
    $('#scValidez', dlg).textContent = reglas.validezHoras;
  }
  function abrir() {
    if (!dlg) construir();
    $('#scRes', dlg).hidden = true;
    reiniciarArena();
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    cargarHoy();
  }
  function cerrar() { parar(); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  disparadores.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); abrir(); }); });

  /* ───────── estado de hoy ───────── */
  var hoyHecho = false;
  function cargarHoy() {
    var jugar = $('#scJugar', dlg);
    jugar.disabled = true; jugar.textContent = 'Un momento…';
    estado().then(function (d) {
      if (!d || !d.ok || !d.activo) { jugar.textContent = 'Disponible pronto'; $('#scAyuda', dlg).textContent = 'El juego estará disponible muy pronto'; return; }
      activo = true; reglas = d.reglas || reglas;
      var h = d.hoy;
      hoyHecho = !!h;
      if (!h) { jugar.disabled = false; jugar.textContent = 'Empezar la jugada del día'; $('#scAyuda', dlg).textContent = 'Toca para empezar'; return; }
      jugar.textContent = 'Jugada de hoy hecha';
      $('#scAyuda', dlg).textContent = 'Vuelve mañana';
      if (h.terminada) mostrarResultado({ media: h.media, pct: h.pct, codigo: h.codigo, vence: h.vence, scoops: null }, true);
      else { var r = $('#scRes', dlg); r.hidden = false; r.innerHTML = '<p class="scoop__msg">Tu jugada de hoy quedó a medias</p><p class="scoop__sub">Se cuenta como jugada del día. Mañana tienes otra; mientras tanto, practica.</p>'; }
    });
  }

  /* ───────── el juego ───────── */
  var J = { estado: 'idle', timer: 0, raf: 0 };
  var YB = 240, YR = 118;
  function el(id) { return $('#' + id, dlg); }

  function nivel(g) {
    var f = Math.max(0, Math.min(g, OBJ)) / OBJ, h = f * (YB - YR), y = YB - h;
    el('scPolvo').setAttribute('y', y); el('scPolvo').setAttribute('height', h);
    el('scSup').setAttribute('y1', y); el('scSup').setAttribute('y2', y);
    el('scSup').setAttribute('opacity', g > 0.02 && g <= OBJ ? 1 : 0);
    var top = y;
    if (g > OBJ) {
      var m = Math.min((g - OBJ) * 70, 80);
      el('scMonton').setAttribute('d', 'M98 118 Q187 ' + (118 - 2 * m) + ' 274 118 Z'); el('scMonton').setAttribute('opacity', 1); top = 118 - m;
    } else el('scMonton').setAttribute('opacity', 0);
    el('scChorro').setAttribute('y2', Math.max(26, top - 2));
  }
  function reiniciarArena() {
    parar();
    nivel(0);
    el('scChorro').setAttribute('opacity', 0);
    el('scNum').innerHTML = ''; el('scErr').textContent = ''; el('scErr').className = 'scoop__err';
    $$('#scTres i', dlg).forEach(function (e) { e.className = ''; });
    el('scN').textContent = 'Scoop 1 de ' + TOTAL;
    el('scModo').textContent = 'Jugada del día';
    el('scAyuda').textContent = '';
    var j = el('scJugar'), p = el('scPractica'); j.disabled = false; p.disabled = false;
  }
  function parar() { clearTimeout(J.timer); cancelAnimationFrame(J.raf); J = { estado: 'idle', timer: 0, raf: 0 }; }
  function bloquear(si) { el('scJugar').disabled = si; el('scPractica').disabled = si; }

  /* rondas: {v: g/s, r: ms de espera}. En la jugada del día las manda el servidor. */
  function practicar() {
    var rondas = [];
    for (var i = 0; i < TOTAL; i++) rondas.push({ v: 2.2 + Math.random() * 1.4, r: 520 + Math.random() * 620 });
    $('#scRes', dlg).hidden = true;
    correr(rondas, 'practica', function (tiempos, res) { mostrarResultado(locales(res), false); });
  }
  function jugarDelDia() {
    if (!activo || hoyHecho) return;
    bloquear(true);
    el('scAyuda').textContent = 'Pidiendo tu jugada…';
    api({ accion: 'iniciar' }).then(function (d) {
      if (!d.ok) { reiniciarArena(); el('scAyuda').textContent = d.error || 'No se pudo iniciar'; hoyHecho = d.status === 409; el('scJugar').disabled = hoyHecho; if (hoyHecho) el('scJugar').textContent = 'Jugada de hoy hecha'; return; }
      hoyHecho = true;
      $('#scRes', dlg).hidden = true;
      var rondas = d.v.map(function (v, i) { return { v: v, r: d.retardos[i] }; });
      correr(rondas, 'dia', function (tiempos) {
        el('scAyuda').textContent = 'Calculando tu resultado…';
        api({ accion: 'finalizar', token: d.token, tiempos: tiempos }).then(function (f) {
          if (!f.ok) { reiniciarArena(); el('scAyuda').textContent = f.error || 'No se pudo cerrar la jugada'; el('scJugar').textContent = 'Jugada de hoy hecha'; el('scJugar').disabled = true; return; }
          mostrarResultado(f, true);
          if (f.codigo) { LS.set('rev_cupon_scoop', { codigo: f.codigo, pct: f.pct, vence: f.vence }); window.dispatchEvent(new Event('scoop:cupon')); }
        }).catch(function () { el('scAyuda').textContent = 'Sin conexión: tu jugada quedó registrada, vuelve a abrir esta ventana.'; });
      });
    }).catch(function () { reiniciarArena(); el('scAyuda').textContent = 'Sin conexión. Intenta de nuevo.'; });
  }

  function correr(rondas, modo, alTerminar) {
    reiniciarArena();
    bloquear(true);
    el('scModo').textContent = modo === 'dia' ? 'Jugada del día' : 'Práctica · sin premio';
    var tiempos = [], res = [], n = 0;
    function siguiente() {
      var ronda = rondas[n]; n++;
      el('scN').textContent = 'Scoop ' + n + ' de ' + TOTAL;
      nivel(0); el('scChorro').setAttribute('opacity', 0); el('scNum').innerHTML = ''; el('scErr').textContent = ''; el('scErr').className = 'scoop__err';
      marcar(res.length, n);
      el('scAyuda').textContent = 'Prepárate…';
      J.estado = 'espera';
      J.timer = setTimeout(function () {
        J.estado = 'sube'; J.v = ronda.v; J.t0 = performance.now(); J.ronda = ronda;
        el('scChorro').setAttribute('opacity', .55); el('scAyuda').textContent = 'Frena al ras';
        J.alFrenar = function (ms, derramo) { fin(ms, derramo); };
        loop();
      }, ronda.r);
    }
    function loop() {
      if (J.estado !== 'sube') return;
      var g = J.v * (performance.now() - J.t0) / 1000;
      if (g >= DERRAME) { J.estado = 'revela'; J.alFrenar(null, true); return; }
      nivel(g); J.raf = requestAnimationFrame(loop);
    }
    function fin(ms, derramo) {
      cancelAnimationFrame(J.raf); J.estado = 'revela';
      var g = derramo ? DERRAME : J.v * ms / 1000, err = g - OBJ, ae = Math.abs(err);
      nivel(g); el('scChorro').setAttribute('opacity', 0);
      tiempos.push(derramo ? null : Math.round(ms * 10) / 10);
      res.push({ g: g, err: err, derramo: derramo });
      marcar(res.length, n);
      el('scNum').innerHTML = derramo ? 'Se derramó' : fg(g) + '<small>g</small>';
      el('scErr').textContent = derramo ? 'Error 1,000 g' : (ae < 0.0005 ? 'Exacto' : (err > 0 ? '+' : '−') + fg(ae) + ' g');
      el('scErr').className = 'scoop__err' + (ae <= reglas.umbrales[3] ? ' ok' : '');
      el('scAyuda').textContent = '';
      try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(derramo ? [30, 40, 30] : 14); } catch (e) { /* sin vibración */ }
      J.timer = setTimeout(function () { if (n < TOTAL) siguiente(); else { J.estado = 'fin'; alTerminar(tiempos, res); } }, 1250);
    }
    J.frenarCon = function (ts) {
      var t = (!ts || ts > 1e12) ? performance.now() : ts, ms = t - J.t0;
      if (J.v * ms / 1000 >= DERRAME) { fin(null, true); return; }
      fin(ms, false);
    };
    siguiente();
  }
  function frenar(ts) { if (J.estado === 'sube' && J.frenarCon) J.frenarCon(ts); }
  function marcar(hechos, actual) {
    $$('#scTres i', dlg).forEach(function (e, i) { e.className = i < hechos ? 'hecho' : (i === actual - 1 && hechos < actual ? 'ahora' : ''); });
  }

  /* práctica: el mismo cálculo, sin servidor ni premio */
  function locales(res) {
    var media = res.reduce(function (s, r) { return s + Math.abs(r.err); }, 0) / res.length;
    return { media: media, pct: 0, codigo: null, practica: true, scoops: res.map(function (r) { return { g: r.g, err: r.err, derramo: r.derramo }; }) };
  }

  function mostrarResultado(R, esDia) {
    bloquear(false);
    el('scAyuda').textContent = '';
    el('scJugar').disabled = true; el('scJugar').textContent = esDia || hoyHecho ? 'Jugada de hoy hecha' : 'Empezar la jugada del día';
    if (!hoyHecho && !esDia) el('scJugar').disabled = false;
    el('scN').textContent = 'Fin';
    var frases = { 5: 'Pulso de cirujano', 3: 'Muy fino', 1: 'Buen pulso' };
    var t = R.pct > 0 ? frases[R.pct] : (esDia ? 'Esta vez no' : 'Práctica terminada');
    var sub = R.pct > 0
      ? 'Error medio ' + fg(R.media) + ' g. Ganaste un ' + R.pct + ' % extra.'
      : 'Error medio ' + fg(R.media) + ' g.' + (esDia ? ' Para el 1 % necesitas bajar de ' + fg(reglas.umbrales[1]) + ' g. Vuelve mañana.' : ' En la jugada del día sí cuenta.');
    var tabla = R.scoops
      ? '<div class="scoop__tabla"><div class="m"><span>Scoop</span><span>Resultado · error</span></div>' + R.scoops.map(function (s, i) { return '<div><span>' + (i + 1) + '</span><b>' + (s.derramo ? 'Se derramó' : fg(s.g) + ' g · ' + (s.err > 0 ? '+' : '−') + fg(Math.abs(s.err))) + '</b></div>'; }).join('') + '</div>'
      : '';
    var ticket = R.codigo
      ? '<div class="scoop__tick"><p class="scoop__tick-p">' + R.pct + '<small> %</small></p><p class="scoop__tick-c">' + R.codigo + '</p><p class="scoop__tick-r">Guardado en este navegador: tu pedido lo aplica solo. Válido ' + reglas.validezHoras + ' h, un solo uso.</p></div>'
      : '';
    var r = $('#scRes', dlg);
    r.hidden = false;
    r.innerHTML = '<p class="scoop__msg">' + t + '</p><p class="scoop__sub">' + sub + '</p>' + tabla + ticket +
      '<div><button type="button" class="scoop__btn" data-scoop-cerrar>' + (R.codigo ? 'Usar mi descuento' : 'Cerrar') + '</button></div>';
    r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
})();
