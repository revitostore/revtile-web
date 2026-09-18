/* Tu tarro en el tiempo.
   Sustituye a la calculadora de pestañas: con cuántos días a la semana
   toma creatina (un scoop de 5 g), los tres tarros se vacían en tiempo
   acelerado y cada uno muestra cuánto dura, cuánto cuesta cada scoop y
   cuánto al mes. Todo son cuentas sobre los precios del catálogo. */
(function () {
  'use strict';

  var root = document.getElementById('tarro');
  if (!root) return;

  var SCOOP_G = 5;                                   // gramos por scoop
  var ANIM = 7000;                                   // duración del tiempo acelerado
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var sl = document.getElementById('tarroSl');
  var out = document.getElementById('tarroSlOut');
  var repetir = document.getElementById('tarroRepetir');
  var dia = document.getElementById('tarroDia');
  var cierre = document.getElementById('tarroCierre');
  var st = { dpw: 5 };

  var P = [].slice.call(root.querySelectorAll('.tarro__card')).map(function (el) {
    return {
      el: el,
      gramos: +el.dataset.gramos, precio: +el.dataset.precio,
      lleno: el.querySelector('.tarro__lleno'),
      dur: 0, mes: 0, toma: 0
    };
  });

  var cop = function (n) { return '$' + Math.round(n).toLocaleString('es-CO'); };

  /* las fotos tienen el tarro entre el 7 % y el 93 % del alto: el nivel
     recorta desde arriba solo esa franja */
  function nivel(p, l) {
    p.lleno.style.clipPath = 'inset(' + (7 + 86 * (1 - l)).toFixed(2) + '% 0 0 0)';
  }

  function cuentas() {
    st.dpw = +sl.value;
    out.textContent = st.dpw + (st.dpw === 1 ? ' día por semana' : ' días por semana');
    P.forEach(function (p) {
      var tomas = Math.floor(p.gramos / SCOOP_G);
      p.dur = Math.round(tomas * 7 / st.dpw);
      p.mes = p.precio / p.dur * 30;
      p.toma = p.precio / tomas;
    });
    var mejor = P.reduce(function (a, b) { return b.mes < a.mes ? b : a; });
    P.forEach(function (p) {
      p.el.querySelector('[data-dur]').textContent = p.dur;
      p.el.querySelector('[data-mes]').textContent = cop(p.mes);
      p.el.querySelector('[data-toma]').textContent = cop(p.toma);
      p.el.classList.toggle('is-best', p === mejor);
      p.el.querySelector('.product__flag').hidden = p !== mejor;
    });
    var chico = P[0], grande = P[P.length - 1], ahorro = chico.mes - grande.mes;
    cierre.innerHTML = ahorro > 0
      ? 'Con <b>' + st.dpw + (st.dpw === 1 ? ' día' : ' días') + ' a la semana</b>, el de ' + grande.gramos +
        ' g te sale <em>' + cop(ahorro) + ' menos al mes</em> que el de ' + chico.gramos +
        ' g, y te dura <b>' + grande.dur + ' días</b>.'
      : '';
  }

  var raf = 0, t0 = 0;
  function cuadro(now) {
    var maxDur = Math.max.apply(null, P.map(function (p) { return p.dur; }));
    var f = Math.min(1, (now - t0) / ANIM), d = f * maxDur;
    P.forEach(function (p) {
      var l = Math.max(0, 1 - d / p.dur);
      nivel(p, l);
      p.el.classList.toggle('is-empty', l <= 0);
    });
    dia.textContent = Math.round(d);
    raf = f < 1 ? requestAnimationFrame(cuadro) : 0;
  }

  function reproducir() {
    cancelAnimationFrame(raf);
    P.forEach(function (p) { nivel(p, 1); p.el.classList.remove('is-empty'); });
    dia.textContent = '0';
    if (reduce) return;
    t0 = performance.now();
    raf = requestAnimationFrame(cuadro);
  }

  sl.addEventListener('input', function () { cuentas(); reproducir(); });
  repetir.addEventListener('click', reproducir);

  cuentas();
  P.forEach(function (p) { nivel(p, 1); });
  var jars = document.getElementById('tarroJars');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es, ob) {
      if (es[0].isIntersecting) { reproducir(); ob.disconnect(); }
    }, { threshold: 0.35 }).observe(jars);
  }
})();
