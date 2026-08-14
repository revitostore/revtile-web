gsap.registerPlugin(ScrollTrigger);

/* ===== Entrada del hero: letras gigantes + tarro ===== */
const heroIn = gsap.timeline({ defaults: { ease: 'power3.out' } });

heroIn
  .from('.nav', { y: -60, opacity: 0, duration: 0.7 })
  .from('.hero__giant span', {
    yPercent: 70,
    opacity: 0,
    duration: 0.9,
    stagger: 0.07,
    ease: 'power4.out',
  }, '-=0.3')
  .from('.hero__meta', { opacity: 0, duration: 0.5 }, '-=0.5')
  .from('.hero__baseline', { scaleX: 0, duration: 0.7, ease: 'power2.inOut' }, '-=0.4')
  .from('.duo__item--on', { x: -50, y: 34, opacity: 0, duration: 1, ease: 'power4.out' }, '-=0.4')
  .from('.duo__item--mt', { x: 50, y: 34, opacity: 0, duration: 1, ease: 'power4.out' }, '-=0.85')
  .from('.duo__seal', { scale: 0.6, rotate: -40, opacity: 0, duration: 0.9, ease: 'power3.out' }, '-=0.7')
  .from('.hero__sub', { y: 30, opacity: 0, duration: 0.7 }, '-=0.5')
  .from('.hero__actions', { y: 30, opacity: 0, duration: 0.7 }, '-=0.5')
  .from('.hero__badges', { opacity: 0, duration: 0.6 }, '-=0.4');

/* ===== Flotación sutil de los dos tarros (desincronizada) ===== */
gsap.to('.duo__item--on img', {
  y: -10,
  duration: 2.7,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});

gsap.to('.duo__item--mt img', {
  y: -12,
  duration: 3.2,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
  delay: 0.5,
});

/* ===== Letras interactivas: se encienden al tocarlas ===== */
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

/* ===== Al hacer scroll: los tarros se acercan suavemente (solo en pantallas grandes,
   en móvil el espacio es justo y terminaban montándose sobre el texto) ===== */
gsap.matchMedia().add('(min-width: 900px)', () => {
  gsap.to('.hero__duo', {
    scale: 1.06,
    yPercent: 6,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });
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
const waFloat = document.getElementById('waFloat');

ScrollTrigger.create({
  trigger: '#productos',
  start: 'top 70%',
  onEnter: () => waFloat.classList.add('is-on'),
  onLeaveBack: () => waFloat.classList.remove('is-on'),
});

/* ===== Tarjetas de producto: toda la tarjeta lleva a la ficha ===== */
document.querySelectorAll('.product').forEach((card) => {
  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return; // respeta el botón de WhatsApp y demás enlaces
    const ficha = card.querySelector('.product__more');
    if (ficha) window.location.href = ficha.getAttribute('href');
  });
});

/* ===== "Pidieron creatina en la última hora" (simulado, compartido entre tarjetas)
   Rango 2-10, con mayor probabilidad entre 3 y 5. Cambia lento: es un dato "por hora". ===== */
const PESOS_PEDIDOS = [[2, 1], [3, 3], [4, 3.2], [5, 2.8], [6, 1.2], [7, 0.8], [8, 0.5], [9, 0.3], [10, 0.2]];

function pedidosAleatorios() {
  const total = PESOS_PEDIDOS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [valor, peso] of PESOS_PEDIDOS) {
    if ((r -= peso) <= 0) return valor;
  }
  return 4;
}

const liveEls = document.querySelectorAll('[data-live]');
let pedidos = pedidosAleatorios();
liveEls.forEach((el) => { el.textContent = pedidos; });

setInterval(() => {
  // deriva de ±1 con tendencia a volver al rango típico (3-5)
  let delta = Math.random() < 0.5 ? -1 : 1;
  if (pedidos >= 6 && Math.random() < 0.7) delta = -1;
  if (pedidos <= 2) delta = 1;
  pedidos = Math.min(10, Math.max(2, pedidos + delta));

  liveEls.forEach((el) => {
    gsap.fromTo(el, { scale: 1.25, color: '#34e07a' }, { scale: 1, color: '#f7f8fa', duration: 0.5 });
    el.textContent = pedidos;
  });
}, 50000 + Math.random() * 40000);

/* ===== Barra de compra fija: visible mientras navegas el catálogo ===== */
const buyBar = document.getElementById('buyBar');

function setBuyBar(visible) {
  buyBar.classList.toggle('is-visible', visible);
  buyBar.setAttribute('aria-hidden', !visible);
  document.body.classList.toggle('buybar-on', visible);
}

ScrollTrigger.create({
  trigger: '#productos',
  start: 'top 55%',
  endTrigger: '.final',
  end: 'top 80%',
  onEnter: () => setBuyBar(true),
  onLeave: () => setBuyBar(false),
  onEnterBack: () => setBuyBar(true),
  onLeaveBack: () => setBuyBar(false),
});

/* ===== Menú móvil ===== */
const burger = document.getElementById('navBurger');
const mobMenu = document.getElementById('mobMenu');

function toggleMenu(open) {
  burger.classList.toggle('is-open', open);
  mobMenu.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', open);
  mobMenu.setAttribute('aria-hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';

  if (open) {
    gsap.fromTo('.mobmenu__link',
      { y: 34, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.07, ease: 'power3.out', delay: 0.08 }
    );
    gsap.fromTo('.mobmenu__cta',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, delay: 0.38, ease: 'power3.out' }
    );
  }
}

burger.addEventListener('click', () => toggleMenu(!mobMenu.classList.contains('is-open')));

mobMenu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => toggleMenu(false));
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
