/* La maleta: el carrito de REVTILE.
   Un solo estado (localStorage) que comparten todas las páginas: lo que se añade en una ficha
   aparece en el menú y en el pedido. Los datos de los productos vienen de js/catalogo.js, que
   genera tools/build-preventa.mjs desde productos.json; el stock de preventa se pide en vivo a
   /api/stock (unidades de la tanda menos lo ya apartado).

   API pública: window.Maleta
     items() cant(k) restante(k) add(k, origen) remove(k) vaciar() on(fn) contar()
     estante(contenedor) bolsa() cuposHtml(k) cargarStock() */
(function () {
  'use strict';

  var CAT = window.CATALOGO;
  if (!CAT) return;

  var KEY = 'rev_maleta_v1';
  var MAX = CAT.max || 10;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var cop = function (n) { return '$' + Math.round(n).toLocaleString('es-CO'); };

  var porK = {};
  CAT.items.forEach(function (it) { it.vars.forEach(function (v) { porK[v.k] = { it: it, v: v }; }); });

  /* ───────── estado ───────── */
  function leer() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(a) ? a.filter(function (k) { return porK[k]; }) : [];
    } catch (e) { return []; }
  }
  var items = leer();
  var vivo = null;          // stock vivo del servidor: { clave: unidades que quedan }
  var oyentes = [];
  var retener = false;      // mientras vuela un frasco, la maleta espera para dibujarlo

  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* sin almacenamiento: vive en memoria */ } }
  function cant(k) { var n = 0; for (var i = 0; i < items.length; i++) if (items[i] === k) n++; return n; }
  function base(k) {
    var d = porK[k];
    if (!d) return 0;
    var s = (vivo && vivo[k] != null) ? vivo[k] : d.v.stock;
    return s == null ? MAX : Math.min(s, MAX);
  }
  function restante(k) { return Math.max(0, base(k) - cant(k)); }
  function precio(it) { return it.precio != null ? it.precio : null; }

  function avisar() {
    oyentes.forEach(function (fn) { try { fn(); } catch (e) { /* un oyente roto no tumba a los demás */ } });
    if (!retener) pintarBolsas();
    pintarNav();
    pintarCupos();
  }

  function add(k, origen) {
    if (!porK[k] || restante(k) <= 0) return false;
    items.push(k);
    guardar();
    if (origen && !reduce) {
      retener = true;
      avisar();
      volar(origen, function () { retener = false; pintarBolsas(); aplastar(); });
    } else { avisar(); aplastar(); }
    return true;
  }
  function remove(k) {
    var i = items.lastIndexOf(k);
    if (i < 0) return;
    items.splice(i, 1);
    guardar();
    avisar();
  }
  function vaciar() { items = []; guardar(); avisar(); }

  window.addEventListener('storage', function (e) { if (e.key === KEY) { items = leer(); avisar(); } });

  /* ───────── stock en vivo ───────── */
  function cargarStock() {
    if (!window.fetch) return Promise.resolve();
    return fetch('/api/stock').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.ok || !d.vivo) return;
      vivo = d.stock;
      var quitado = [];
      Object.keys(porK).forEach(function (k) {
        while (cant(k) > base(k)) { items.splice(items.lastIndexOf(k), 1); quitado.push(porK[k].it.nombre); }
      });
      if (quitado.length) { guardar(); toast('Se agotó una unidad mientras decidías y la quitamos de tu maleta'); }
      avisar();
    }).catch(function () { /* sin red: se queda con el stock del catálogo */ });
  }

  /* ───────── piezas de UI compartidas ───────── */
  function cuposHtml(k) {
    var d = porK[k];
    if (!d || d.v.stock == null) return '';
    var s = Math.min(d.v.stock, 12), r = restante(k);
    if (base(k) <= 0 || (r <= 0 && cant(k) === 0)) {
      return '<span class="pre-cupos is-agotado" role="img" aria-label="Agotado"><span class="pre-cupos__sq" aria-hidden="true"><i></i></span><span class="pre-cupos__txt" aria-hidden="true"><b>Agotado</b></span></span>';
    }
    var sq = '';
    for (var i = 0; i < s; i++) sq += '<i class="' + (i < r ? '' : 'off') + '"></i>';
    return '<span class="pre-cupos" role="img" aria-label="Quedan ' + r + '"><span class="pre-cupos__sq" aria-hidden="true">' + sq +
      '</span><span class="pre-cupos__txt" aria-hidden="true">' + (r > 0 ? 'Quedan <b>' + r + '</b>' : 'Sin más unidades') + '</span></span>';
  }
  function pintarCupos() {
    $$('[data-cupos-k]').forEach(function (el) { el.innerHTML = cuposHtml(el.getAttribute('data-cupos-k')); });
    /* tarjetas con varios sabores: suma de lo que queda */
    $$('[data-cupos-keys]').forEach(function (el) {
      var ks = el.getAttribute('data-cupos-keys').split(','), tot = 0, r = 0;
      ks.forEach(function (k) { tot += porK[k] ? (porK[k].v.stock || 0) : 0; r += restante(k); });
      var sq = '';
      for (var i = 0; i < Math.min(tot, 12); i++) sq += '<i class="' + (i < r ? '' : 'off') + '"></i>';
      el.innerHTML = r > 0
        ? '<span class="pre-cupos" role="img" aria-label="Quedan ' + r + '"><span class="pre-cupos__sq" aria-hidden="true">' + sq + '</span><span class="pre-cupos__txt" aria-hidden="true">Quedan <b>' + r + '</b></span></span>'
        : '<span class="pre-cupos is-agotado" role="img" aria-label="Agotado"><span class="pre-cupos__sq" aria-hidden="true"><i></i></span><span class="pre-cupos__txt" aria-hidden="true"><b>Agotado</b></span></span>';
    });
  }

  var toastEl, toastT;
  function toast(msg, conEnlace) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mal-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '<span>' + msg + '</span>' + (conEnlace ? '<a href="pedido.html">Ver maleta →</a>' : '');
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 3400);
  }

  /* ícono de la maleta en el menú: aparece cuando hay algo adentro */
  var navEl;
  function crearNav() {
    var inner = $('.nav__inner');
    if (!inner || document.body.classList.contains('co')) return;
    navEl = document.createElement('a');
    navEl.className = 'nav__bolsa';
    navEl.href = 'pedido.html';
    navEl.hidden = true;
    navEl.setAttribute('aria-label', 'Mi maleta');
    navEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5c0-1.4 1-2.5 2.4-2.5h12.2c1.4 0 2.4 1.1 2.4 2.5v6.2c0 1.4-1 2.3-2.4 2.3H5.9c-1.4 0-2.4-.9-2.4-2.3z"/><path d="M8 9V7.4C8 5.5 9.8 4 12 4s4 1.5 4 3.4V9"/><path d="M3.5 13.5h17"/></svg><span class="nav__bolsa-n">0</span>';
    inner.insertBefore(navEl, $('.nav__cta', inner) || $('.nav__burger', inner) || null);
  }
  function pintarNav() {
    if (!navEl) return;
    var n = items.length;
    navEl.hidden = n === 0;
    $('.nav__bolsa-n', navEl).textContent = n;
  }

  /* ───────── la maleta dibujada ───────── */
  var bolsas = [], serie = 0;
  var SLOTS = { 1: [180], 2: [134, 226], 3: [98, 180, 262], 4: [82, 143, 217, 278] };
  var ANCHO = { 1: 132, 2: 108, 3: 92, 4: 80 }, ALTO = { 1: 152, 2: 140, 3: 128, 4: 118 };

  function crearBolsa() {
    var id = 'mb' + (++serie);
    var el = document.createElement('div');
    el.className = 'mal-bag';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Tu maleta');
    el.innerHTML =
      '<svg class="mal-bag__s" viewBox="0 0 360 280" aria-hidden="true">' +
        '<path d="M122 140 C122 22, 238 22, 238 140" fill="none" stroke="#14140F" stroke-width="9" stroke-linecap="round"/>' +
        '<path d="M44 138 Q44 98 82 94 L278 94 Q316 98 316 138 Z" fill="#DADAD1" stroke="#14140F" stroke-width="2.5" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="mal-bag__jars"></div>' +
      '<svg class="mal-bag__s" viewBox="0 0 360 280" aria-hidden="true">' +
        '<defs><clipPath id="' + id + '"><path d="M28 138 Q180 120 332 138 L340 248 Q340 264 324 264 L36 264 Q20 264 20 248 Z"/></clipPath></defs>' +
        '<path d="M28 138 Q180 120 332 138 L340 248 Q340 264 324 264 L36 264 Q20 264 20 248 Z" fill="#F6F6F2"/>' +
        '<polygon points="236,264 340,160 340,264" fill="#E31D36" clip-path="url(#' + id + ')"/>' +
        '<rect x="38" y="172" width="84" height="26" fill="#14140F"/>' +
        '<text x="48" y="190.5" font-family="Anton,Impact,sans-serif" font-size="15" fill="#fff" letter-spacing=".6">REVTILE<tspan fill="#E31D36">.</tspan></text>' +
        '<path d="M40 146 Q180 130 320 146" fill="none" stroke="#14140F" stroke-width="1.5" stroke-dasharray="3 4"/>' +
        '<rect x="232" y="132" width="9" height="20" rx="1" fill="#14140F" transform="rotate(4 236 142)"/>' +
        '<path d="M34 250 Q180 256 326 250" fill="none" stroke="#14140F" stroke-width="1.2" stroke-dasharray="4 5" opacity=".55"/>' +
        '<path d="M28 138 Q180 120 332 138 L340 248 Q340 264 324 264 L36 264 Q20 264 20 248 Z" fill="none" stroke="#14140F" stroke-width="2.5" stroke-linejoin="round"/>' +
      '</svg>' +
      '<span class="mal-bag__n" hidden>0</span>';
    var b = { el: el, jars: $('.mal-bag__jars', el), n: $('.mal-bag__n', el) };
    bolsas.push(b);
    pintarBolsa(b);
    return el;
  }

  function visibles() {
    var unicos = [], repetidos = [], cuenta = {};
    items.forEach(function (k) { cuenta[k] = (cuenta[k] || 0) + 1; (cuenta[k] === 1 ? unicos : repetidos).push({ k: k, n: cuenta[k] }); });
    return unicos.concat(repetidos).slice(0, 4);
  }
  function pintarBolsa(b) {
    var vis = visibles(), n = vis.length, vivos = {};
    vis.forEach(function (u, i) {
      var id = u.k + '#' + u.n, d = porK[u.k];
      vivos[id] = true;
      var im = $('[data-u="' + id + '"]', b.jars);
      if (!im) {
        im = new Image();
        im.dataset.u = id; im.alt = ''; im.src = d.v.img;
        im.className = 'mal-jar' + (reduce ? '' : ' nuevo');
        im.addEventListener('animationend', function () { im.classList.remove('nuevo'); });
        b.jars.appendChild(im);
      }
      var esc = d.v.esc || 1, ar = d.v.ar || .8;
      var h = Math.min(ALTO[n] * esc, ANCHO[n] * esc / ar), cx = SLOTS[n][i], bottom = 134 + h * .36 + (i % 2 ? 5 : 0);
      im.style.height = (h / 280 * 100) + '%';
      im.style.top = ((bottom - h) / 280 * 100) + '%';
      im.style.left = (cx / 360 * 100) + '%';
      im.style.zIndex = String(10 - Math.round(Math.abs(cx - 180) / 30));
    });
    $$('.mal-jar', b.jars).forEach(function (j) { if (!vivos[j.dataset.u]) j.remove(); });
    b.n.hidden = items.length === 0;
    b.n.textContent = items.length;
    b.el.setAttribute('aria-label', items.length ? 'Tu maleta: ' + items.length + (items.length === 1 ? ' producto' : ' productos') : 'Tu maleta, vacía');
  }
  function pintarBolsas() { bolsas.forEach(pintarBolsa); }

  function aplastar() {
    if (reduce) return;
    bolsas.forEach(function (b) {
      if (!b.el.getBoundingClientRect().width || !b.el.animate) return;
      b.el.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.025,.965)', offset: .35 }, { transform: 'scale(.99,1.012)', offset: .7 }, { transform: 'scale(1,1)' }], { duration: 380, easing: 'ease-out' });
    });
  }

  /* el frasco vuela de la tarjeta a la maleta (o al ícono del menú / la barra inferior) */
  function destino() {
    var vistas = bolsas.filter(function (b) { var r = b.el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; });
    if (vistas.length) { var r = vistas[0].el.getBoundingClientRect(); return { x: r.left + r.width * .5, y: r.top + r.height * .22 }; }
    var alt = (navEl && !navEl.hidden && navEl) || $('.co__bar');
    if (alt) { var q = alt.getBoundingClientRect(); return { x: q.left + q.width * .5, y: q.top + q.height * .5 }; }
    return null;
  }
  function volar(img, fin) {
    var r = img.getBoundingClientRect(), d = destino();
    if (!d || !r.width || !img.animate) { fin(); return; }
    var c = document.createElement('img');
    c.src = img.currentSrc || img.src; c.alt = '';
    c.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height +
      'px;z-index:1000;pointer-events:none;object-fit:contain;filter:drop-shadow(0 10px 14px rgba(20,20,15,.22))';
    document.body.appendChild(c);
    var tx = d.x - (r.left + r.width / 2), ty = d.y - (r.top + r.height / 2);
    var a = c.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + tx * .5 + 'px,' + (Math.min(ty, 0) - 80) + 'px) scale(.78) rotate(-9deg)', offset: .45, opacity: 1 },
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.45) rotate(4deg)', opacity: .9 }
    ], { duration: 470, easing: 'cubic-bezier(.35,.1,.3,1)' });
    a.onfinish = function () { c.remove(); fin(); };
    a.oncancel = function () { c.remove(); fin(); };
  }

  /* ───────── el estante (pedido.html) ───────── */
  var ICO_MAS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg>';
  var ICO_MENOS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12"/></svg>';
  var seleccion = {};

  function estante(cont) {
    CAT.items.forEach(function (it) {
      var primero = it.vars.filter(function (v) { return restante(v.k) > 0; })[0] || it.vars[0];
      seleccion[it.id] = primero.id;
      var el = document.createElement('article');
      el.className = 'mal-it';
      el.dataset.id = it.id;
      el.innerHTML =
        '<div class="mal-it__top"><span class="mal-mono">' + it.cat + '</span>' + (it.pre ? '<span class="mal-tag">Preventa</span>' : '') + '</div>' +
        '<div class="mal-it__foto"><img alt="' + it.marca + ' ' + it.nombre + '"></div>' +
        '<p class="mal-mono mal-it__marca">' + it.marca + '</p>' +
        '<h3 class="mal-it__nom">' + it.nombre + '</h3><p class="mal-it__tam">' + it.tam + '</p>' +
        (it.vars.length > 1 ? '<div class="mal-sab" role="radiogroup" aria-label="Sabor">' + it.vars.map(function (v) { return '<button type="button" role="radio" class="mal-sab__b" data-v="' + v.id + '">' + v.sabor + '</button>'; }).join('') + '</div>' : '') +
        '<div class="mal-it__cup" data-cup></div>' +
        '<div class="mal-it__pie"><span class="mal-it__precio" data-precio></span><div data-ctl></div></div>';
      cont.appendChild(el);
    });
    cont.addEventListener('click', function (e) {
      var sab = e.target.closest('.mal-sab__b');
      if (!sab) return;
      var el = sab.closest('.mal-it');
      seleccion[el.dataset.id] = sab.dataset.v;
      pintarCard(el);
    });
    function todo() { $$('.mal-it', cont).forEach(pintarCard); }
    oyentes.push(todo);
    todo();
  }
  function pintarCard(el) {
    var it = CAT.items.filter(function (x) { return x.id === el.dataset.id; })[0];
    var v = it.vars.filter(function (x) { return x.id === seleccion[it.id]; })[0] || it.vars[0];
    var q = cant(v.k), r = restante(v.k);
    $$('.mal-sab__b', el).forEach(function (b) { var on = b.dataset.v === v.id; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
    var im = $('.mal-it__foto img', el);
    if (im.dataset.k !== v.k) { im.src = v.img; im.dataset.k = v.k; }
    $('[data-cup]', el).innerHTML = it.pre ? cuposHtml(v.k) : '';
    var pr = precio(it), pe = $('[data-precio]', el);
    pe.className = 'mal-it__precio' + (pr == null ? ' x' : '');
    pe.textContent = pr == null ? 'Sin pago hoy' : cop(pr);
    var nombre = it.nombre + (v.sabor ? ' ' + v.sabor : '');
    var ctl = $('[data-ctl]', el);
    if (q === 0) {
      ctl.innerHTML = r > 0
        ? '<button type="button" class="mal-add" data-maleta-add="' + v.k + '" aria-label="' + (it.pre ? 'Apartar ' : 'Añadir ') + nombre + '">' + ICO_MAS + '</button>'
        : '<span class="mal-mono mal-agot">Agotado</span>';
    } else {
      ctl.innerHTML = '<div class="mal-stp"><button type="button" data-maleta-menos="' + v.k + '" aria-label="Quitar uno">' + ICO_MENOS + '</button><output>' + q + '</output><button type="button" data-maleta-add="' + v.k + '" aria-label="Añadir otro"' + (r <= 0 ? ' disabled' : '') + '>' + ICO_MAS + '</button></div>';
    }
  }

  /* ───────── eventos globales ───────── */
  document.addEventListener('click', function (e) {
    var menos = e.target.closest && e.target.closest('[data-maleta-menos]');
    if (menos) { remove(menos.getAttribute('data-maleta-menos')); return; }
    var b = e.target.closest && e.target.closest('[data-maleta-add]');
    if (!b || b.disabled) return;
    var k = b.getAttribute('data-maleta-add');
    if (!porK[k]) return;
    e.preventDefault();
    e.stopPropagation();
    var sel = b.getAttribute('data-maleta-img');
    var origen = sel ? $(sel) : null;
    if (!origen) { var card = b.closest('.product, .mal-it, .pp-hero__inner'); origen = card && $('img', card); }
    if (!add(k, origen)) { toast('No quedan más unidades de este producto'); return; }
    if (!document.body.classList.contains('co')) toast(porK[k].it.pre ? 'Apartado en tu maleta' : 'Añadido a la maleta', true);
  });

  function iniciar() {
    crearNav();
    $$('[data-maleta-bolsa]').forEach(function (c) { c.appendChild(crearBolsa()); });
    $$('[data-maleta-estante]').forEach(estante);
    pintarNav();
    pintarCupos();
    if ($('[data-cupos-k], [data-cupos-keys], [data-maleta-estante]') || $('[data-maleta-add]')) cargarStock();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  window.Maleta = {
    CAT: CAT, porK: porK,
    items: function () { return items.slice(); },
    contar: function () { return items.length; },
    cant: cant, restante: restante, add: add, remove: remove, vaciar: vaciar,
    on: function (fn) { oyentes.push(fn); }, avisar: avisar,
    estante: estante, bolsa: crearBolsa, cuposHtml: cuposHtml, cargarStock: cargarStock, toast: toast
  };
})();
