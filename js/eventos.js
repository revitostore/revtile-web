/* Eventos anónimos del sitio: miden el embudo (vista → producto → canasta → pedido) sin datos personales.
   - La sesión es un número al azar que vive solo en la pestaña (sessionStorage); al cerrarla desaparece.
   - No se envía IP, nombre, teléfono ni nada que identifique a la persona (el servidor tampoco lo guarda).
   - Si el navegador pide no ser rastreado (Do Not Track o Global Privacy Control), no se manda nada. */
(function () {
  'use strict';
  var nav = navigator;
  if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true) return;
  if (!nav.sendBeacon) return;
  var ruta = location.pathname;
  if (/^\/(gestion)/i.test(ruta)) return;

  var sesion;
  try {
    sesion = sessionStorage.getItem('rev_s');
    if (!sesion) {
      var b = new Uint8Array(10);
      (window.crypto || window.msCrypto).getRandomValues(b);
      sesion = Array.prototype.map.call(b, function (x) { return (x % 36).toString(36); }).join('') + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('rev_s', sesion);
    }
  } catch (e) { return; }
  if (!/^[a-z0-9]{12,24}$/.test(sesion)) return;

  var disp = window.innerWidth < 700 ? 'm' : 'd';
  var hechos = {};
  function enviar(tipo, k) {
    var clave = tipo + '|' + (k || '');
    if (tipo !== 'canasta' && hechos[clave]) return;
    hechos[clave] = 1;
    var c = { sesion: sesion, tipo: tipo, ruta: ruta, disp: disp };
    if (k) c.k = k;
    try { nav.sendBeacon('/api/e', new Blob([JSON.stringify(c)], { type: 'application/json' })); } catch (e) { /* sin red: no pasa nada */ }
  }

  function iniciar() {
    var pagina = ruta.replace(/^\//, '');
    if (pagina && !/\.html$/.test(pagina)) pagina += '.html';
    var enPedido = /^pedido(\.html)?$/.test(ruta.replace(/^\//, ''));
    var enReservada = /^\/(pedido|rastreo|terminos|404)/i.test(ruta);

    if (!enReservada) enviar('vista');
    if (window.CATALOGO && pagina) {
      var it = window.CATALOGO.items.filter(function (x) { return x.pagina === pagina; })[0];
      if (it) enviar('producto', it.id);
    }
    if (enPedido && window.Maleta && window.Maleta.contar() > 0) enviar('pedido_inicio');
  }
  window.addEventListener('maleta:add', function (e) {
    var k = e.detail && e.detail.k;
    if (k) enviar('canasta', k.split(':')[0]);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
