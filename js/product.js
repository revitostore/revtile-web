gsap.registerPlugin(ScrollTrigger);

/* ===== Entrada de la página de producto ===== */
const ppIn = gsap.timeline({ defaults: { ease: 'power4.out' } });

ppIn
  .from('.nav', { y: -60, opacity: 0, duration: 0.7 })
  .from('.hero__giant span', {
    yPercent: 70,
    opacity: 0,
    duration: 0.9,
    stagger: 0.06,
  }, '-=0.3')
  .from('.hero__meta', { opacity: 0, duration: 0.5 }, '-=0.5')
  .from('.hero__baseline', { scaleX: 0, duration: 0.7, ease: 'power2.inOut' }, '-=0.4')
  .from('.pp-jar', { y: 110, opacity: 0, scale: 0.92, duration: 1.1 }, '-=0.5')
  .from('.pp-stats', { y: 26, opacity: 0, duration: 0.7 }, '-=0.6');

/* ===== Flotación sutil del tarro ===== */
gsap.to('.pp-jar img', {
  y: -10,
  duration: 2.8,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});

/* ===== Letras interactivas ===== */
document.querySelectorAll('.hero__giant span').forEach((letter) => {
  if (letter.classList.contains('neon')) return;
  const light = () => {
    letter.classList.add('lit');
    clearTimeout(letter._litTimer);
    letter._litTimer = setTimeout(() => letter.classList.remove('lit'), 650);
  };
  letter.addEventListener('mouseenter', light);
  letter.addEventListener('touchstart', light, { passive: true });
});

/* ===== Reveal de secciones ===== */
document.querySelectorAll('.reveal').forEach((el) => {
  gsap.fromTo(
    el,
    { y: 40, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    }
  );
});

/* ===== Tachado animado del precio viejo ===== */
ScrollTrigger.create({
  trigger: '.pp-buy__inner',
  start: 'top 80%',
  once: true,
  onEnter: () => document.querySelector('.pp-buy__inner').closest('section').classList.add('struck'),
});

/* ===== Botón flotante de WhatsApp ===== */
const waFloat = document.getElementById('waFloat');

ScrollTrigger.create({
  trigger: '.pp-buy',
  start: 'top 75%',
  onEnter: () => waFloat.classList.add('is-on'),
  onLeaveBack: () => waFloat.classList.remove('is-on'),
});

/* ===== Cupos de lanzamiento (edítalos en el HTML: data-cupos-quedan) ===== */
document.querySelectorAll('[data-cupos-total]').forEach((el) => {
  const total = parseInt(el.dataset.cuposTotal, 10);
  const quedan = parseInt(el.dataset.cuposQuedan, 10);
  el.textContent = quedan >= total
    ? `Solo ${total} cupos de lanzamiento`
    : `Quedan ${quedan} de ${total} cupos de lanzamiento`;
});

/* ===== Escritorio: brillo que sigue el cursor + botones magnéticos =====
   Se inicia al cargar o al primer movimiento de mouse (por si el ancho se reporta tarde) */
let fxEscritorioListo = false;

function initFxEscritorio(e) {
  if (fxEscritorioListo) return;
  if (e && e.pointerType && e.pointerType !== 'mouse') return;
  if (!window.matchMedia('(hover: hover) and (min-width: 900px)').matches) return;
  fxEscritorioListo = true;

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);
  window.addEventListener('pointermove', (e) => {
    gsap.to(glow, { x: e.clientX, y: e.clientY, duration: 0.55, ease: 'power3.out' });
  });

  document.querySelectorAll('.btn, .nav__cta').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      gsap.to(b, {
        x: (e.clientX - r.left - r.width / 2) * 0.18,
        y: (e.clientY - r.top - r.height / 2) * 0.35,
        duration: 0.3,
      });
    });
    b.addEventListener('pointerleave', () => {
      gsap.to(b, { x: 0, y: 0, duration: 0.45, ease: 'elastic.out(1, 0.45)' });
    });
  });
}

initFxEscritorio();
window.addEventListener('pointermove', initFxEscritorio);
