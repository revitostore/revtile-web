/* Fichas de preventa: elegir sabor.
   Cambiar de sabor actualiza la galería, las unidades que quedan, la tabla
   nutricional y el mensaje de WhatsApp. Todo viene de #preData, que genera
   tools/build-preventa.mjs; aquí solo se pinta. Sin JavaScript la ficha
   sigue completa: muestra el primer sabor y todas las tablas. */
(function () {
  'use strict';

  var el = document.getElementById('preData');
  if (!el) return;
  var D = JSON.parse(el.textContent);
  var V = D.variantes;
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var botones = $$('.pre-sabor');
  var main = document.getElementById('ppMain');
  var tira = document.querySelector('.pp-gal__thumbs');
  var cupos = document.getElementById('preCupos');
  var bloques = $$('.pre-var');
  var enlaces = $$('[data-wa]');
  var textoCta = $$('[data-wa-txt]');

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

  function ver(id, actualizarUrl) {
    var v = V.filter(function (x) { return x.id === id; })[0] || V[0];
    botones.forEach(function (b) {
      var on = b.dataset['var'] === v.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    pintarGaleria(v);
    if (cupos) cupos.innerHTML = v.cupos;
    bloques.forEach(function (b) { b.hidden = b.dataset['var'] !== v.id; });
    enlaces.forEach(function (a) { a.href = v.wa; });
    textoCta.forEach(function (t) { t.textContent = v.cta; });
    if (actualizarUrl && v.sabor && window.history && history.replaceState) {
      history.replaceState(null, '', '?sabor=' + v.id);
    }
  }

  botones.forEach(function (b) {
    b.addEventListener('click', function () { ver(b.dataset['var'], true); });
  });

  /* enlace compartido: ?sabor=extreme abre ya con ese sabor */
  var pedido = /[?&]sabor=([\w-]+)/.exec(location.search);
  ver(pedido ? pedido[1] : V[0].id, false);
})();
