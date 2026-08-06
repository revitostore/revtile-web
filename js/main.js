gsap.registerPlugin(ScrollTrigger);

/* ===== Entrada del hero: letras gigantes + tarro ===== */
const heroIn = gsap.timeline({ defaults: { ease: 'power3.out' } });

heroIn
  .from('.nav', { y: -60, opacity: 0, duration: 0.7 })
  .from('.hero__eyebrow', { y: 30, opacity: 0, duration: 0.6 }, '-=0.3')
  .from('.hero__giant span', {
    yPercent: 70,
    opacity: 0,
    duration: 0.9,
    stagger: 0.07,
    ease: 'power4.out',
  }, '-=0.3')
  .from('.hero__carousel', {
    y: 160,
    scale: 0.7,
    opacity: 0,
    duration: 1.3,
    ease: 'back.out(1.2)',
  }, '-=0.55')
  .from('.hero__floor', { opacity: 0, scale: 0.5, duration: 1 }, '-=0.9')
  .from('.hero__jarname', { y: 20, opacity: 0, duration: 0.6 }, '-=0.7')
  .from('.hero__sub', { y: 30, opacity: 0, duration: 0.7 }, '-=0.6')
  .from('.hero__actions', { y: 30, opacity: 0, duration: 0.7 }, '-=0.5')
  .from('.hero__badges', { y: 20, opacity: 0, duration: 0.6 }, '-=0.4')
  .from('.hero__scroll-hint', { opacity: 0, duration: 0.6 }, '-=0.3');

/* ===== Flotación sutil del tarro ===== */
gsap.to('.hero__carousel', {
  y: -12,
  duration: 2.8,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});

/* ===== Carrusel del hero: alterna entre las dos creatinas ===== */
const jars = gsap.utils.toArray('.hero__jar');
const jarName = document.getElementById('jarName');
const jarNames = [
  'Optimum Nutrition · Micronized Creatine 300g',
  'MuscleTech · Platinum Creatine 400g',
];
let jarIdx = 0;

setInterval(() => {
  const current = jars[jarIdx];
  jarIdx = (jarIdx + 1) % jars.length;
  const next = jars[jarIdx];

  gsap.to(current, {
    x: -70,
    opacity: 0,
    scale: 0.85,
    rotate: -5,
    duration: 0.55,
    ease: 'power2.in',
    onComplete: () => {
      current.classList.remove('is-active');
      gsap.set(current, { x: 0, scale: 1, rotate: 0 });
    },
  });

  gsap.fromTo(next,
    { x: 70, opacity: 0, scale: 0.85, rotate: 5 },
    {
      x: 0,
      opacity: 1,
      scale: 1,
      rotate: 0,
      duration: 0.75,
      ease: 'power3.out',
      delay: 0.25,
      onStart: () => next.classList.add('is-active'),
    }
  );

  gsap.to(jarName, {
    opacity: 0,
    y: 8,
    duration: 0.3,
    delay: 0.2,
    onComplete: () => {
      jarName.textContent = jarNames[jarIdx];
      gsap.to(jarName, { opacity: 1, y: 0, duration: 0.4 });
    },
  });
}, 4200);

/* ===== Al hacer scroll: el tarro se acerca suavemente (las letras se quedan) ===== */
gsap.to('.hero__carousel', {
  scale: 1.1,
  yPercent: 8,
  ease: 'none',
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
  },
});

/* ===== Movimiento suave de los blobs de color ===== */
gsap.to('.blob--red', {
  x: -60, y: 70,
  duration: 9,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});

gsap.to('.blob--teal', {
  x: 70, y: -60,
  duration: 11,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});

/* ===== Reveal genérico de secciones ===== */
document.querySelectorAll('.reveal').forEach((el) => {
  gsap.fromTo(
    el,
    { y: 50, opacity: 0 },
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

/* ===== Precios: tachado animado + pop del precio de oferta ===== */
document.querySelectorAll('.product').forEach((card) => {
  ScrollTrigger.create({
    trigger: card,
    start: 'top 75%',
    once: true,
    onEnter: () => {
      card.classList.add('struck');
      gsap.fromTo(
        card.querySelector('.product__price'),
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, delay: 0.55, ease: 'back.out(2)' }
      );
      gsap.fromTo(
        card.querySelector('.product__save'),
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, delay: 0.9, ease: 'back.out(2)' }
      );
    },
  });
});

/* ===== Contadores de beneficios ===== */
document.querySelectorAll('[data-count]').forEach((el) => {
  const target = parseInt(el.dataset.count, 10);
  const counter = { val: 0 };
  gsap.to(counter, {
    val: target,
    duration: 1.4,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 88%',
    },
    onUpdate: () => {
      el.textContent = Math.round(counter.val);
    },
  });
});

/* ===== Botón flotante de WhatsApp: aparece tras salir del hero ===== */
gsap.to('#waFloat', {
  opacity: 1,
  duration: 0.4,
  scrollTrigger: {
    trigger: '#productos',
    start: 'top 70%',
    toggleActions: 'play none none reverse',
  },
});

/* ===== "Personas viendo ahora" (simulado con caminata aleatoria) ===== */
document.querySelectorAll('[data-live]').forEach((el) => {
  let count = 6 + Math.floor(Math.random() * 8); // arranca entre 6 y 13
  el.textContent = count;

  const tick = () => {
    // sube o baja de a 1-2, acotado entre 4 y 19 para que sea creíble
    const delta = Math.random() < 0.5 ? -1 : 1;
    count = Math.min(19, Math.max(4, count + delta * (Math.random() < 0.25 ? 2 : 1)));

    gsap.fromTo(el, { scale: 1.25, color: '#34e07a' }, { scale: 1, color: '#f7f8fa', duration: 0.5 });
    el.textContent = count;

    setTimeout(tick, 3500 + Math.random() * 5000);
  };

  setTimeout(tick, 2500 + Math.random() * 3000);
});

/* ===== FAQ: solo un item abierto a la vez ===== */
document.querySelectorAll('.faq__item').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('.faq__item[open]').forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});
