/* Polvo de creatina del hero.
   Miles de partículas se juntan sobre el campo rojo y forman REVTILE, y
   se apartan del cursor o del dedo. Es decoración: no lleva texto que
   leer (el nombre ya está en el logo y el titular), no recibe clics y se
   apaga solo si no cabe o si el usuario pidió menos movimiento. */
(function () {
  'use strict';

  var hero = document.querySelector('.hero--solo');
  if (!hero) return;
  var art = hero.querySelector('.hero__art');
  var texto = hero.querySelector('.hero__texto');
  var campo = hero.querySelector('.hero__campo');
  var inner = hero.querySelector('.hero__inner');
  if (!art || !campo || !inner) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.createElement('canvas');
  cv.className = 'hero__polvo';
  cv.setAttribute('aria-hidden', 'true');
  hero.insertBefore(cv, inner);
  var ctx = cv.getContext('2d');
  if (!ctx) return;

  var TAN = Math.tan(13 * Math.PI / 180);   // la inclinación del campo rojo (skewX 13deg)
  var K = 0.022, DAMP = 0.86, R = 70, FORCE = 3.2;
  var FUENTE = 'px Anton, Impact, sans-serif';
  var W = 0, H = 0, P = [], t0 = 0, raf = 0, visible = false, px = -9999, py = -9999;

  var mc = document.createElement('canvas').getContext('2d');
  function ancho(t, fs) { mc.font = fs + FUENTE; return mc.measureText(t).width; }
  function alto(fs) {
    mc.font = fs + FUENTE;
    var a = mc.measureText('REVTILE').actualBoundingBoxAscent;
    return a || fs * 0.8;
  }

  /* el nombre siempre en una sola línea: lo más grande que quepa en el hueco */
  function tamano(rw, rh) {
    var b = 100;
    return Math.min(Math.min(rw / ancho('REVTILE', b), rh / alto(b)) * b, 150);
  }

  function build() {
    var hr = hero.getBoundingClientRect();
    W = Math.round(hr.width); H = Math.round(hr.height);
    P = [];
    if (W < 2 || H < 2) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* el hueco libre: encima de los tarros y a la derecha del texto */
    var ar = art.getBoundingClientRect();
    var x0 = ar.left - hr.left, x1 = ar.right - hr.left;
    if (texto) x0 = Math.max(x0, texto.getBoundingClientRect().right - hr.left + 12);
    var y0 = 28, y1 = ar.top - hr.top - 10;
    var rw = x1 - x0, rh = y1 - y0;
    if (rw < 90 || rh < 50) return;   // no cabe: el hero queda como estaba

    var fs = tamano(rw, rh), asc = alto(fs);
    var off = document.createElement('canvas');
    off.width = Math.ceil(rw); off.height = Math.ceil(rh);
    var o = off.getContext('2d');
    o.font = fs + FUENTE; o.textAlign = 'center'; o.textBaseline = 'alphabetic'; o.fillStyle = '#fff';
    /* si la palabra es chica frente al hueco (celular) se sube al tope del campo, donde el rojo es más
       ancho y todo el polvo queda blanco; si lo llena (escritorio), va centrada */
    var y = (asc < rh * 0.55 ? 6 : (rh - asc) / 2) + asc;
    o.fillText('REVTILE', rw / 2, y);

    var d = o.getImageData(0, 0, off.width, off.height).data, pts = [], step = 2;
    for (var j = 0; j < off.height; j += step) {
      for (var i = 0; i < off.width; i += step) {
        if (d[(j * off.width + i) * 4 + 3] > 140) pts.push([x0 + i + (Math.random() - 0.5) * 3, y0 + j + (Math.random() - 0.5) * 3]);
      }
    }
    if (pts.length > 4200) {
      var k = pts.length / 4200;
      pts = pts.filter(function (_, n) { return Math.floor(n / k) !== Math.floor((n - 1) / k); });
    }
    P = pts.map(function (p) {
      return {
        x: x0 - 40 + Math.random() * (rw + 80), y: Math.random() * (y1 + 80),
        vx: 0, vy: 0, tx: p[0], ty: p[1],
        s: Math.random() * 1.1 + 0.9, d: Math.random() * 1300, ph: Math.random() * 6.28
      };
    });
    if (reduce) P.forEach(function (p) { p.x = p.tx; p.y = p.ty; });
    t0 = performance.now();
  }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    var hr = hero.getBoundingClientRect(), cr = campo.getBoundingClientRect();
    var e0 = cr.left - hr.left, eTop = cr.top - hr.top;   // borde izquierdo del campo rojo
    var el = now - t0, i, p;
    for (i = 0; i < P.length; i++) {
      p = P[i];
      if (!reduce) {
        if (el < p.d) {
          p.x += Math.sin(now / 700 + p.ph) * 0.25; p.y += Math.cos(now / 900 + p.ph) * 0.25;
        } else {
          var tx = p.tx + Math.sin(now / 1100 + p.ph) * 0.6, ty = p.ty + Math.cos(now / 1300 + p.ph) * 0.6;
          p.vx += (tx - p.x) * K; p.vy += (ty - p.y) * K;
          var mx = p.x - px, my = p.y - py, d2 = mx * mx + my * my;
          if (d2 < R * R) {
            var dd = Math.sqrt(d2) || 1, f = (1 - dd / R) * FORCE;
            p.vx += mx / dd * f; p.vy += my / dd * f;
          }
          p.vx *= DAMP; p.vy *= DAMP; p.x += p.vx; p.y += p.vy;
        }
      }
      p.w = p.x > e0 + TAN * (p.y - eTop) + 1;   // sobre el rojo: polvo blanco; sobre el papel: tinta
    }
    ctx.fillStyle = 'rgba(255,255,255,.93)';
    for (i = 0; i < P.length; i++) { p = P[i]; if (p.w) ctx.fillRect(p.x, p.y, p.s, p.s); }
    ctx.fillStyle = 'rgba(20,20,15,.88)';
    for (i = 0; i < P.length; i++) { p = P[i]; if (!p.w) ctx.fillRect(p.x, p.y, p.s, p.s); }
    raf = visible && !reduce ? requestAnimationFrame(frame) : 0;
  }

  function arrancar() { if (!raf) raf = requestAnimationFrame(frame); }

  function pos(e) {
    var r = hero.getBoundingClientRect();
    px = e.clientX - r.left; py = e.clientY - r.top;
  }
  hero.addEventListener('pointermove', pos);
  hero.addEventListener('pointerleave', function () { px = py = -9999; });
  hero.addEventListener('pointerdown', function (e) {
    if (reduce || (e.target.closest && e.target.closest('a, button'))) return;
    pos(e);
    P.forEach(function (p) {
      var dx = p.x - px, dy = p.y - py, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var m = (5 + Math.random() * 9) * Math.max(0.25, 1 - dist / 380);
      p.vx += dx / dist * m + (Math.random() - 0.5) * 3;
      p.vy += dy / dist * m + (Math.random() - 0.5) * 3;
    });
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) arrancar();
    }, { threshold: 0.05 }).observe(hero);
  } else {
    visible = true;
  }

  var rt;
  function reconstruir() { clearTimeout(rt); rt = setTimeout(function () { build(); arrancar(); }, 160); }
  if ('ResizeObserver' in window) new ResizeObserver(reconstruir).observe(hero);
  else window.addEventListener('resize', reconstruir);

  function iniciar() { build(); arrancar(); }
  if (document.fonts && document.fonts.load) document.fonts.load('100px Anton').then(iniciar, iniciar);
  else iniciar();
})();
