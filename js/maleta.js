/* La canasta de REVTILE.
   Un solo estado (localStorage) que comparten todas las páginas: lo que se añade en una tarjeta o
   en una ficha aparece en el menú y en el pedido, y la persona sigue comprando donde estaba. Los
   datos de los productos vienen de js/catalogo.js, que genera tools/build-suplementos.mjs desde
   productos.json; el stock de los suplementos se pide en vivo a /api/stock. Nunca se muestran
   cantidades: solo se avisa cuando algo está agotado.

   API pública: window.Maleta
     items() cant(k) restante(k) add(k, origen) remove(k) vaciar() on(fn) contar()
     canasta(contenedor) cuposHtml(k) cargarStock() toast(msg) */
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

  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* sin almacenamiento: vive en memoria */ } }
  function cant(k) { var n = 0; for (var i = 0; i < items.length; i++) if (items[i] === k) n++; return n; }
  function base(k) {
    var d = porK[k];
    if (!d) return 0;
    var s = (vivo && vivo[k] != null) ? vivo[k] : d.v.stock;
    return s == null ? MAX : Math.min(s, MAX);
  }
  function restante(k) { return Math.max(0, base(k) - cant(k)); }

  function avisar() {
    oyentes.forEach(function (fn) { try { fn(); } catch (e) { /* un oyente roto no tumba a los demás */ } });
    pintarNav();
    pintarCupos();
  }

  function add(k, origen) {
    if (!porK[k] || restante(k) <= 0) return false;
    items.push(k);
    guardar();
    avisar();
    if (origen && !reduce) volar(origen);
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
      var quitado = false;
      Object.keys(porK).forEach(function (k) {
        while (cant(k) > base(k)) { items.splice(items.lastIndexOf(k), 1); quitado = true; }
      });
      if (quitado) { guardar(); toast('Se agotó una unidad mientras decidías y la quitamos de tu canasta'); }
      avisar();
    }).catch(function () { /* sin red: se queda con el stock del catálogo */ });
  }

  /* ───────── piezas de UI compartidas ───────── */
  function cuposHtml(k) {
    var d = porK[k];
    return d && d.v.stock != null && base(k) <= 0 ? '<span class="pre-agot">Agotado</span>' : '';
  }

  /* Tarjetas: el botón dice «Añadir», «En tu canasta» o «Agotado» según el stock real */
  function pintarCupos() {
    $$('[data-cupos-k]').forEach(function (el) { el.innerHTML = cuposHtml(el.getAttribute('data-cupos-k')); });
    $$('[data-chip]').forEach(function (c) { c.classList.toggle('is-agotado', base(c.getAttribute('data-chip')) <= 0); });
    $$('.pre-card [data-maleta-add]').forEach(function (b) {
      var k = b.getAttribute('data-maleta-add'), t = $('[data-add-txt]', b);
      if (!porK[k]) return;
      var r = restante(k), agotado = base(k) <= 0;
      b.disabled = r <= 0;
      if (t) t.textContent = agotado ? 'Agotado' : r <= 0 ? 'En tu canasta' : 'Añadir';
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
    toastEl.innerHTML = '<span>' + msg + '</span>' + (conEnlace ? '<a href="pedido.html">Ver canasta →</a>' : '');
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 3400);
  }

  /* ícono de la canasta en el menú: aparece cuando hay algo adentro */
  var navEl;
  function crearNav() {
    var inner = $('.nav__inner');
    if (!inner || document.body.classList.contains('co')) return;
    navEl = document.createElement('a');
    navEl.className = 'nav__bolsa';
    navEl.href = 'pedido.html';
    navEl.hidden = true;
    navEl.setAttribute('aria-label', 'Mi canasta');
    navEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5c0-1.4 1-2.5 2.4-2.5h12.2c1.4 0 2.4 1.1 2.4 2.5v6.2c0 1.4-1 2.3-2.4 2.3H5.9c-1.4 0-2.4-.9-2.4-2.3z"/><path d="M8 9V7.4C8 5.5 9.8 4 12 4s4 1.5 4 3.4V9"/><path d="M3.5 13.5h17"/></svg><span class="nav__bolsa-n">0</span>';
    inner.insertBefore(navEl, $('.nav__cta', inner) || $('.nav__burger', inner) || null);
  }
  function pintarNav() {
    if (!navEl) return;
    var n = items.length;
    navEl.hidden = n === 0;
    $('.nav__bolsa-n', navEl).textContent = n;
    navEl.setAttribute('aria-label', 'Mi canasta: ' + n + (n === 1 ? ' producto' : ' productos'));
  }

  /* el frasco vuela de la tarjeta al ícono de la canasta */
  function volar(img) {
    var r = img.getBoundingClientRect();
    var alt = navEl && !navEl.hidden ? navEl : $('.co__bar');
    if (!alt || !r.width || !img.animate) return;
    var q = alt.getBoundingClientRect();
    var c = document.createElement('img');
    c.src = img.currentSrc || img.src; c.alt = '';
    c.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height +
      'px;z-index:1000;pointer-events:none;object-fit:contain;filter:drop-shadow(0 10px 14px rgba(20,20,15,.22))';
    document.body.appendChild(c);
    var tx = q.left + q.width / 2 - (r.left + r.width / 2), ty = q.top + q.height / 2 - (r.top + r.height / 2);
    var a = c.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + tx * .5 + 'px,' + (Math.min(ty, 0) - 60) + 'px) scale(.6) rotate(-8deg)', offset: .5, opacity: 1 },
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.12) rotate(4deg)', opacity: .8 }
    ], { duration: 520, easing: 'cubic-bezier(.35,.1,.3,1)' });
    a.onfinish = function () { c.remove(); };
    a.oncancel = function () { c.remove(); };
  }

  /* ───────── la canasta en el pedido ───────── */
  var ICO_MAS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg>';
  var ICO_MENOS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12"/></svg>';

  function canasta(cont) {
    function pintar() {
      var cuenta = {}, orden = [];
      items.forEach(function (k) { if (!cuenta[k]) { cuenta[k] = 0; orden.push(k); } cuenta[k]++; });
      if (!orden.length) {
        cont.innerHTML = '<p class="can-vacia">Tu canasta está vacía. <a href="index.html#productos">Ver la tienda →</a></p>';
        return;
      }
      cont.innerHTML = orden.map(function (k) {
        var d = porK[k], it = d.it, v = d.v, q = cuenta[k];
        var sub = it.marca + (v.sabor ? ' · ' + v.sabor : '');
        var viejo = it.antes && it.antes > it.precio ? ' <s>' + cop(it.antes * q) + '</s>' : '';
        return '<div class="can-fila">' +
          '<a class="can-fila__foto" href="' + it.pagina + '"><img src="' + v.img + '" alt=""></a>' +
          '<div class="can-fila__txt"><p class="can-fila__nom">' + it.nombre + '</p><p class="can-fila__sub">' + sub + '</p></div>' +
          '<div class="mal-stp"><button type="button" data-maleta-menos="' + k + '" aria-label="Quitar uno de ' + it.nombre + '">' + ICO_MENOS + '</button><output>' + q + '</output>' +
          '<button type="button" data-maleta-add="' + k + '" aria-label="Añadir otro de ' + it.nombre + '"' + (restante(k) <= 0 ? ' disabled' : '') + '>' + ICO_MAS + '</button></div>' +
          '<p class="can-fila__precio">' + cop(it.precio * q) + viejo + '</p>' +
          '</div>';
      }).join('');
    }
    oyentes.push(pintar);
    pintar();
  }

  /* ───────── eventos globales ───────── */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var menos = t.closest('[data-maleta-menos]');
    if (menos) { remove(menos.getAttribute('data-maleta-menos')); return; }

    /* fichas de sabor de una tarjeta: cambian la foto y a qué producto apunta el botón */
    var chip = t.closest('[data-chip]');
    if (chip) {
      var card = chip.closest('.pre-card');
      $$('[data-chip]', card).forEach(function (c) { var on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', String(on)); });
      var btn = $('[data-maleta-add]', card);
      if (btn) btn.setAttribute('data-maleta-add', chip.getAttribute('data-chip'));
      var im = $('.product__photo img', card), so = $('.product__photo source', card), b = chip.getAttribute('data-img');
      if (im && b) { if (so) so.srcset = b + '.webp'; im.src = b + '.png'; im.alt = chip.getAttribute('data-alt') || ''; }
      pintarCupos();
      return;
    }

    /* filtro de la tienda */
    var filtro = t.closest('[data-filtro]');
    if (filtro) {
      var f = filtro.getAttribute('data-filtro');
      $$('[data-filtro]').forEach(function (x) { x.classList.toggle('is-on', x === filtro); x.setAttribute('aria-pressed', String(x === filtro)); });
      $$('.pre-card[data-cat]').forEach(function (c) { c.hidden = f !== 'todo' && c.getAttribute('data-cat') !== f; });
      return;
    }

    var b2 = t.closest('[data-maleta-add]');
    if (!b2 || b2.disabled) return;
    var k = b2.getAttribute('data-maleta-add');
    if (!porK[k]) return;
    e.preventDefault();
    e.stopPropagation();
    var sel = b2.getAttribute('data-maleta-img');
    var origen = sel ? $(sel) : null;
    if (!origen) { var c2 = b2.closest('.product, .pp-hero__inner'); origen = c2 && $('img', c2); }
    if (!add(k, origen)) { toast('Ya no hay más unidades de este producto'); return; }
    if (!document.body.classList.contains('co')) toast('Añadido a la canasta', true);
  });

  function iniciar() {
    crearNav();
    $$('[data-maleta-canasta]').forEach(canasta);
    pintarNav();
    pintarCupos();
    if ($('[data-maleta-add]')) cargarStock();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  window.Maleta = {
    CAT: CAT, porK: porK,
    items: function () { return items.slice(); },
    contar: function () { return items.length; },
    cant: cant, restante: restante, add: add, remove: remove, vaciar: vaciar,
    on: function (fn) { oyentes.push(fn); }, avisar: avisar,
    canasta: canasta, cuposHtml: cuposHtml, cargarStock: cargarStock, toast: toast
  };
})();
