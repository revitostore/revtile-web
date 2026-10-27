/* Mientras una imagen carga se muestra un fondo que respira; si no llega, queda una caja neutra
   con su descripción en vez de un hueco roto. Sin JavaScript todo se ve igual que siempre. */
(function () {
  'use strict';
  function contenedor(img) {
    var p = img.closest('picture');
    return (p ? p.parentElement : img.parentElement) || img;
  }
  function seguir(img) {
    if (img.complete && img.naturalWidth > 0) return;
    var c = contenedor(img);
    if (!c || c === document.body) return;
    c.classList.add('img-cargando');
    var fin = function (fallo) {
      c.classList.remove('img-cargando');
      if (fallo) {
        c.classList.add('img-error');
        if (img.alt) c.setAttribute('data-alt', img.alt);
      }
    };
    if (img.complete) { fin(img.naturalWidth === 0); return; }
    img.addEventListener('load', function () { fin(false); }, { once: true });
    img.addEventListener('error', function () { fin(true); }, { once: true });
  }
  function iniciar() { Array.prototype.forEach.call(document.images, seguir); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  /* imágenes que se crean después (galerías, canasta) */
  if ('MutationObserver' in window) {
    new MutationObserver(function (m) {
      m.forEach(function (r) {
        r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'IMG') seguir(n);
          else if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('img'), seguir);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
