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
