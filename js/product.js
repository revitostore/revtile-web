/* ===== REVTILE — fichas de producto =====
   Galería, entrada de secciones y CTA fija en móvil. Sin librerías. */
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
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('is-in'); }); }, 4000);
  }

  /* ── Nav ───────────────────────────────────────────────────────── */
  var nav = $('#nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Galería del producto ──────────────────────────────────────── */
  var main = $('#ppMain');
  var thumbs = $$('.pp-gal__thumb');
  if (main && thumbs.length) {
    var mostrar = function (btn) {
      thumbs.forEach(function (t) { t.classList.remove('is-active'); });
      btn.classList.add('is-active');
      main.src = btn.dataset.src;
      main.alt = btn.dataset.alt || '';
    };
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () { mostrar(btn); });
      btn.addEventListener('keydown', function (e) {
        var i = thumbs.indexOf(btn);
        if (e.key === 'ArrowRight' && thumbs[i + 1]) { thumbs[i + 1].focus(); mostrar(thumbs[i + 1]); }
        if (e.key === 'ArrowLeft' && thumbs[i - 1]) { thumbs[i - 1].focus(); mostrar(thumbs[i - 1]); }
      });
    });
  }

  /* ── FAQ: solo una abierta ─────────────────────────────────────── */
  $$('.faq__item').forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      $$('.faq__item[open]').forEach(function (o) { if (o !== item) o.open = false; });
    });
  });

  /* ── CTA fija en móvil: aparece al perder de vista el botón real ── */
  var sticky = $('#ppSticky');
  var cta = $('.pp-buy .btn--primary');
  if (sticky && cta && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var on = !e.isIntersecting && e.boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', on);
        sticky.setAttribute('aria-hidden', String(!on));
        var b = $('.btn', sticky);
        if (b) b.tabIndex = on ? 0 : -1;
        document.body.classList.toggle('pp-sticky-on', on);
      });
    }, { threshold: 0 }).observe(cta);
  }
})();
