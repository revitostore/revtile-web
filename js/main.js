/* =====================================================================
   REVTILE — comportamiento de la portada
   Sin librerías: todo lo que hacía GSAP aquí lo hacen IntersectionObserver
   y transiciones CSS. Si este archivo no carga, la página se lee igual.
   ===================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ── Entrada de secciones ──────────────────────────────────────── */
  var reveals = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach(function (el) { io.observe(el); });
    /* red de seguridad: nada se queda invisible pase lo que pase */
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('is-in'); }); }, 4000);
  }


  /* ── El campo rojo del hero se retira con el scroll ──────────────
     Una sola escritura de una variable CSS por cuadro, y solo mientras
     el hero está a la vista: fuera de ahí el listener no hace nada. */
  var hero = document.querySelector('.hero--solo');
  var campo = document.querySelector('.hero__campo');
  if (hero && campo && !reduce) {
    var enPantalla = true;
    var pedido = false;

    var pintar = function () {
      pedido = false;
      var alto = hero.offsetHeight || 1;
      var avance = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / alto));
      /* de 0 % a 46 %: el campo se desliza hacia la derecha y deja el
         catálogo sobre negro limpio */
      hero.style.setProperty('--campo', (avance * 46).toFixed(2) + '%');
    };

    var alScroll = function () {
      if (!enPantalla || pedido) return;
      pedido = true;
      requestAnimationFrame(pintar);
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { enPantalla = e.isIntersecting; if (enPantalla) alScroll(); });
      }, { rootMargin: '10px' }).observe(hero);
    }
    window.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', alScroll, { passive: true });
    pintar();
  }

  /* ── Nav: línea inferior al despegarse del borde ───────────────── */
  var nav = $('#nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Menú móvil ────────────────────────────────────────────────── */
  var burger = $('#navBurger');
  var mob = $('#mobMenu');
  if (burger && mob) {
    var setMenu = function (open) {
      burger.classList.toggle('is-open', open);
      mob.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      mob.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) { var f = mob.querySelector('a'); if (f) f.focus(); }
    };
    burger.addEventListener('click', function () { setMenu(!mob.classList.contains('is-open')); });
    $$('a', mob).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mob.classList.contains('is-open')) { setMenu(false); burger.focus(); }
    });
  }

  /* ── FAQ: solo una abierta a la vez ────────────────────────────── */
  $$('.faq__item').forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      $$('.faq__item[open]').forEach(function (o) { if (o !== item) o.open = false; });
    });
  });

  /* ── Galería: los videos arrancan cuando el visitante lo pide ──── */
  $$('.gallery__item--video').forEach(function (fig) {
    var video = $('video', fig);
    var play = $('.gallery__play', fig);
    if (!video || !play) return;
    play.addEventListener('click', function () {
      fig.classList.add('is-playing');
      video.setAttribute('controls', '');
      video.play();
    });
  });

  /* ── Barra de compra y botón de WhatsApp ───────────────────────── */
  var buyBar = $('#buyBar');
  var waFloat = $('#waFloat');
  var productos = $('#productos');
  var cierre = $('.final');

  if (productos && 'IntersectionObserver' in window) {
    var visible = false;
    var setBar = function (on) {
      if (on === visible) return;
      visible = on;
      if (buyBar) {
        buyBar.classList.toggle('is-visible', on);
        buyBar.setAttribute('aria-hidden', String(!on));
        var b = $('.buybar__btn', buyBar);
        if (b) b.tabIndex = on ? 0 : -1;
      }
      if (waFloat) waFloat.classList.toggle('is-on', on);
      document.body.classList.toggle('buybar-on', on);
    };
    /* visible entre el catálogo y el cierre */
    var seenProducts = false, atEnd = false;
    var sync = function () { setBar(seenProducts && !atEnd); };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { seenProducts = e.boundingClientRect.top < 0 || e.isIntersecting; sync(); });
    }, { rootMargin: '-40% 0px 0px 0px' }).observe(productos);
    if (cierre) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { atEnd = e.isIntersecting; sync(); });
      }, { rootMargin: '0px 0px -20% 0px' }).observe(cierre);
    }
  }

  /* ── Calculadora: cuánto dura y cuánto cuesta el día ───────────── */
  var calc = $('.calc__box');
  if (calc) {
    var fmt = function (n) { return '$' + n.toLocaleString('es-CO'); };
    var st = { gramos: 300, precio: 120000, dosis: 5 };

    var render = function () {
      var dias = Math.floor(st.gramos / st.dosis);
      var meses = (dias / 30).toFixed(1).replace('.0', '');
      $('#calcDias').textContent = dias;
      $('#calcMeses').textContent = meses;
      $('#calcDia').textContent = fmt(Math.round(st.precio / dias));
      $('#calcNote').innerHTML = 'Tomando <b>' + st.dosis + ' g diarios</b>, este tarro te acompaña <b>' +
        dias + ' días seguidos</b> por <b>' + fmt(Math.round(st.precio / dias)) + ' al día</b>.';
    };

    $$('.calc__tab', calc).forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.calc__tab', calc).forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        st.gramos = parseInt(tab.dataset.servGramos, 10);
        st.precio = parseInt(tab.dataset.precio, 10);
        render();
      });
    });

    $$('.calc__dosebtn', calc).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.calc__dosebtn', calc).forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        st.dosis = parseInt(btn.dataset.g, 10);
        render();
      });
    });

    render();
  }

  /* ── Prueba social: números reales o nada ──────────────────────── */
  var proof = document.getElementById('socialProof');
  if (proof && 'fetch' in window) {
    fetch('/api/social')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.entregados_total) return;   // sin datos, no se muestra
        var fecha = d.generado_en;
        $$('[data-social]', proof).forEach(function (el) {
          var k = el.getAttribute('data-social');
          el.textContent = k === 'generado_en' ? fecha : Number(d[k] || 0).toLocaleString('es-CO');
        });
        proof.hidden = false;
      })
      .catch(function () { /* silencio: preferimos no decir nada */ });
  }

  /* ── Flechas de las galerías ──────────────────────────────────────
     Se inyectan aquí y no en el HTML por dos razones: no repetir el
     mismo marcado en nueve páginas, y que sin JavaScript la galería
     siga funcionando con el dedo, que es como se usa en móvil. */
  document.querySelectorAll('.gallery__track').forEach(function (via) {
    var marco = document.createElement('div');
    marco.className = 'gallery__marco';
    via.parentNode.insertBefore(marco, via);
    marco.appendChild(via);

    var hacer = function (lado, etiqueta) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gallery__nav gallery__nav--' + lado;
      b.setAttribute('aria-label', etiqueta);
      b.innerHTML = '<span aria-hidden="true"></span>';
      marco.appendChild(b);
      return b;
    };
    var atras = hacer('atras', 'Ver las anteriores');
    var alante = hacer('alante', 'Ver las siguientes');

    var paso = function () {
      var uno = via.querySelector('.gallery__item');
      /* un elemento y su separación: el salto deja la siguiente foto
         alineada al borde, nunca cortada por la mitad */
      return uno ? uno.getBoundingClientRect().width + 16 : via.clientWidth * .8;
    };
    atras.addEventListener('click', function () {
      via.scrollBy({ left: -paso(), behavior: reduce ? 'auto' : 'smooth' });
    });
    alante.addEventListener('click', function () {
      via.scrollBy({ left: paso(), behavior: reduce ? 'auto' : 'smooth' });
    });

    /* una flecha que no lleva a ninguna parte se apaga */
    var pintar = function () {
      var max = via.scrollWidth - via.clientWidth - 2;
      atras.disabled = via.scrollLeft <= 2;
      alante.disabled = via.scrollLeft >= max;
      marco.classList.toggle('sin-flechas', max <= 2);
    };
    var pedido = false;
    via.addEventListener('scroll', function () {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(function () { pedido = false; pintar(); });
    }, { passive: true });
    window.addEventListener('resize', pintar, { passive: true });
    pintar();
  });

})();
