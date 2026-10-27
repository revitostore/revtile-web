/* Fichas de suplementos: elegir sabor.
   Cambiar de sabor actualiza la galería, la tabla nutricional y a qué producto apunta el botón de
   la maleta (y si queda stock). Los datos vienen de #preData, que genera tools/build-suplementos.mjs;
   las unidades que quedan las pinta js/maleta.js en vivo. Sin JavaScript la ficha sigue completa:
   muestra el primer sabor y todas las tablas. */
(function () {
  'use strict';

  var el = document.getElementById('preData');
  if (!el) return;
  var D = JSON.parse(el.textContent);
  var V = D.variantes;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var botones = $$('.pre-sabor');
  var main = document.getElementById('ppMain');
  var tira = $('.pp-gal__thumbs');
  var bloques = $$('.pre-var');
  var cta = document.getElementById('preCta');
  var agotado = document.getElementById('preAgotado');
  var enlaceAgotado = agotado && agotado.querySelector('[data-wa]');
  var actualId = V[0].id;

  function variante(id) { return V.filter(function (x) { return x.id === id; })[0] || V[0]; }

  function pintarGaleria(v) {
    if (!main || !tira) return;
    tira.innerHTML = '';
    var mostrar = function (b, src, alt) {
      $$('.pp-gal__thumb').forEach(function (t) { t.classList.remove('is-active'); });
      b.classList.add('is-active');
      main.src = src;
      main.alt = alt;
    };
    v.galeria.forEach(function (g, i) {
      var b = document.createElement('button');
      var src = g[0] + '.webp';
      b.className = 'pp-gal__thumb' + (i === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', 'Ver foto ' + (i + 1) + ': ' + g[1]);
      var im = document.createElement('img');
      im.src = src; im.alt = ''; im.loading = 'lazy';
      b.appendChild(im);
      b.addEventListener('click', function () { mostrar(b, src, g[1]); });
      b.addEventListener('keydown', function (e) {
        var hermanos = $$('.pp-gal__thumb'), k = hermanos.indexOf(b);
        var otro = e.key === 'ArrowRight' ? hermanos[k + 1] : e.key === 'ArrowLeft' ? hermanos[k - 1] : null;
        if (otro) { otro.focus(); otro.click(); }
      });
      tira.appendChild(b);
    });
    main.src = v.galeria[0][0] + '.webp';
    main.alt = v.galeria[0][1];
  }

  /* Los botones apuntan al sabor elegido y dicen la verdad sobre el stock */
  var comprar = document.getElementById('preComprar');
  function pintarBoton() {
    var v = variante(actualId), M = window.Maleta;
    $$('[data-maleta-add]').forEach(function (b) { b.setAttribute('data-maleta-add', v.k); });
    $$('[data-comprar]').forEach(function (b) { b.setAttribute('data-comprar', v.k); });
    if (!M || !cta) return;
    var enMaleta = M.cant(v.k), queda = M.restante(v.k), baseU = queda + enMaleta;
    var sinStock = baseU <= 0, todoAdentro = !sinStock && queda <= 0;
    var txt = cta.querySelector('[data-cta-txt]');
    cta.disabled = sinStock || todoAdentro;
    if (txt) txt.textContent = sinStock ? 'Agotado' : todoAdentro ? 'Ya está en tu maleta' : (enMaleta ? 'Añadir otra unidad' : 'Añadir a la maleta');
    if (comprar) {
      /* si ya está todo adentro, comprar solo lleva al pedido */
      comprar.disabled = sinStock;
      var t2 = comprar.querySelector('[data-cta-txt]');
      if (t2) t2.textContent = sinStock ? 'Agotado' : (enMaleta ? 'Ir a pagar' : 'Comprar ahora');
    }
    if (agotado) {
      agotado.hidden = !sinStock;
      if (enlaceAgotado) enlaceAgotado.href = v.wa;
    }
  }

  /* «Comprar ahora»: lo mete a la maleta (si aún no está) y va directo al pedido */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-comprar]');
    var M = window.Maleta;
    if (!b || b.disabled) return;
    var k = b.getAttribute('data-comprar');
    if (M && !M.cant(k) && !M.add(k)) return;
    location.href = 'pedido.html';
  });

  function ver(id, actualizarUrl) {
    var v = variante(id);
    actualId = v.id;
    botones.forEach(function (b) {
      var on = b.dataset['var'] === v.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    pintarGaleria(v);
    bloques.forEach(function (b) { b.hidden = b.dataset['var'] !== v.id; });
    pintarBoton();
    if (actualizarUrl && v.sabor && window.history && history.replaceState) {
      history.replaceState(null, '', '?sabor=' + v.id);
    }
  }

  botones.forEach(function (b) {
    b.addEventListener('click', function () { ver(b.dataset['var'], true); });
  });
  if (window.Maleta) window.Maleta.on(pintarBoton);

  /* enlace compartido: ?sabor=extreme abre ya con ese sabor */
  var pedido = /[?&]sabor=([\w-]+)/.exec(location.search);
  ver(pedido ? pedido[1] : V[0].id, false);
})();
