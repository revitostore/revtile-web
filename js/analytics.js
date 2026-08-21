/* ============================================================
   Medición REVTILE — Google Analytics 4 + Microsoft Clarity
   ------------------------------------------------------------
   PEGA TUS IDs AQUÍ ABAJO (o pídeselo a Claude):
   - GA_ID:      en analytics.google.com → Administrar → Flujos de datos
                 → tu flujo web → "ID de medición" (empieza por G-)
   - CLARITY_ID: en clarity.microsoft.com → tu proyecto → Settings
                 → Overview → "Project ID" (unas 10 letras/números)
   Mientras un ID diga PENDIENTE, ese servicio NO se carga.
   ============================================================ */
var GA_ID = 'G-6F23FS4ZH1';
var CLARITY_ID = 'y5n8rfjbqw';

(function () {
  // --- Google Analytics 4 ---
  if (GA_ID && GA_ID.indexOf('PENDIENTE') === -1) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  // --- Microsoft Clarity (mapas de calor y grabaciones anónimas) ---
  if (CLARITY_ID && CLARITY_ID.indexOf('PENDIENTE') === -1) {
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    var c = document.createElement('script');
    c.async = true;
    c.src = 'https://www.clarity.ms/tag/' + CLARITY_ID;
    document.head.appendChild(c);
  }

  // --- Conversión principal: clics hacia WhatsApp ---
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (!link || !window.gtag) return;
    window.gtag('event', 'whatsapp_click', {
      link_text: (link.textContent || '').trim().slice(0, 60) || 'icono',
      page_path: location.pathname,
    });
  }, true);
})();
