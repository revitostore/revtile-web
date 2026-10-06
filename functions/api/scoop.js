/* ===== Llena el scoop: el juego, validado en el servidor =====
   GET  /api/scoop?jugador=ID          → estado de hoy y reglas (activo:false si falta la tabla o la llave)
   POST /api/scoop {accion:'iniciar'}   → reparte 3 velocidades y retardos, firmados; consume la jugada del día
   POST /api/scoop {accion:'finalizar'} → recibe los tiempos de frenado, calcula el error y emite el cupón

   El navegador solo dibuja y mide cuándo frena. El servidor es quien decide las velocidades,
   recalcula los gramos, valida que el tiempo transcurrido sea posible, limita a una jugada por
   jugador y día, y crea el cupón (porcentaje, un solo uso, vence en 48 h). */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/* El premio máximo es 5 %. Los umbrales salen de una simulación: un jugador promedio tiene ~6 %
   de probabilidad de ganar ALGO y ~0,08 % de llegar al 5 %. */
export const REGLAS = {
  objetivo: 5,           // gramos
  scoops: 3,
  vmin: 2.2, vmax: 3.6,  // g/s
  derrame: 6.0,          // g: pasado esto, se derramó
  retardoMin: 520, retardoMax: 1140, // ms antes de que empiece a subir
  umbrales: { 5: 0.011, 3: 0.026, 1: 0.050 }, // error medio máximo en g para cada premio
  piso: 0.0025,          // un error medio menor que esto no es humano: no hay premio
  validezHoras: 48,
  maxPorIp: 8,           // jugadas por IP y día (varios jugadores pueden compartir red móvil)
  vigenciaJugada: 10 * 60 * 1000, // ms que vale una jugada iniciada
  holguraTiempo: 1800,   // ms de tolerancia para latencia al validar el tiempo transcurrido
};

const enc = new TextEncoder();
const llave = (env) => env.SCOOP_SECRET || env.WOMPI_INTEGRITY || env.ADMIN_KEY || null;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); };

async function firmar(secreto, texto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}
async function sha(texto) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const igual = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

/* el día cambia a medianoche de Bogotá (UTC-5, sin horario de verano) */
export const diaBogota = (ahora = Date.now()) => new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10);

const aleatorio = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const entre = (min, max) => min + aleatorio() * (max - min);
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigoAzar = (n) => { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map((x) => ALFABETO[x % ALFABETO.length]).join(''); };

export const premioPara = (media) => {
  const u = REGLAS.umbrales;
  return media <= u[5] ? 5 : media <= u[3] ? 3 : media <= u[1] ? 1 : 0;
};

/* ¿está lista la tabla? (si no corrieron la migración v5, el juego no se ofrece) */
async function tablaLista(db) {
  try { await db.prepare('SELECT 1 FROM scoop_jugadas LIMIT 1').first(); return true; } catch (e) { return false; }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const jugador = (url.searchParams.get('jugador') || '').trim();
  const activo = !!llave(env) && !!env.DB && (await tablaLista(env.DB));
  const base = { ok: true, activo, reglas: { scoops: REGLAS.scoops, umbrales: REGLAS.umbrales, validezHoras: REGLAS.validezHoras } };
  if (!activo || !/^[A-Za-z0-9-]{12,64}$/.test(jugador)) return json({ ...base, hoy: null });
  const f = await env.DB.prepare('SELECT media, pct, codigo FROM scoop_jugadas WHERE dia = ? AND jugador = ?').bind(diaBogota(), jugador).first();
  if (!f) return json({ ...base, hoy: null });
  let vence = null;
  if (f.codigo) {
    try { const c = await env.DB.prepare('SELECT vence_en FROM cupones WHERE codigo = ?').bind(f.codigo).first(); vence = c && c.vence_en; } catch (e) { /* sin columna: sin fecha */ }
  }
  return json({ ...base, hoy: { terminada: f.media != null, media: f.media, pct: f.pct, codigo: f.codigo, vence } });
}

export async function onRequestPost({ request, env }) {
  const secreto = llave(env);
  if (!secreto || !env.DB || !(await tablaLista(env.DB))) return json({ ok: false, error: 'El juego no está disponible todavía' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'JSON inválido' }, 400); }
  const jugador = String(b.jugador || '').trim();
  if (!/^[A-Za-z0-9-]{12,64}$/.test(jugador)) return json({ ok: false, error: 'Jugador inválido' }, 400);

  /* ───────── iniciar ───────── */
  if (b.accion === 'iniciar') {
    const dia = diaBogota();
    const ip = (await sha((request.headers.get('CF-Connecting-IP') || '') + '|scoop')).slice(0, 16);
    const porIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM scoop_jugadas WHERE dia = ? AND ip = ?').bind(dia, ip).first();
    if (porIp && porIp.n >= REGLAS.maxPorIp) return json({ ok: false, error: 'Hoy ya se jugó mucho desde esta red. Vuelve mañana.' }, 429);
    const r = await env.DB.prepare('INSERT OR IGNORE INTO scoop_jugadas (dia, jugador, ip) VALUES (?,?,?)').bind(dia, jugador, ip).run();
    if (!r.meta.changes) return json({ ok: false, error: 'Ya usaste tu jugada de hoy. Vuelve mañana.' }, 409);
    const v = [], ret = [];
    for (let i = 0; i < REGLAS.scoops; i++) { v.push(Math.round(entre(REGLAS.vmin, REGLAS.vmax) * 1000) / 1000); ret.push(Math.round(entre(REGLAS.retardoMin, REGLAS.retardoMax))); }
    const carga = b64u(enc.encode(JSON.stringify({ j: jugador, d: dia, t: Date.now(), v, r: ret })));
    return json({ ok: true, token: carga + '.' + (await firmar(secreto, carga)), v, retardos: ret });
  }

  /* ───────── finalizar ───────── */
  if (b.accion === 'finalizar') {
    const [carga, firma] = String(b.token || '').split('.');
    if (!carga || !firma || !igual(firma, await firmar(secreto, carga))) return json({ ok: false, error: 'Jugada inválida' }, 400);
    let t;
    try { t = JSON.parse(deB64u(carga)); } catch (e) { return json({ ok: false, error: 'Jugada inválida' }, 400); }
    if (t.j !== jugador) return json({ ok: false, error: 'Jugada inválida' }, 400);
    const transcurrido = Date.now() - t.t;
    if (transcurrido > REGLAS.vigenciaJugada) return json({ ok: false, error: 'La jugada venció' }, 400);
    if (!Array.isArray(b.tiempos) || b.tiempos.length !== REGLAS.scoops) return json({ ok: false, error: 'Faltan tiempos' }, 400);

    const fila = await env.DB.prepare('SELECT media FROM scoop_jugadas WHERE dia = ? AND jugador = ?').bind(t.d, jugador).first();
    if (!fila || fila.media != null) return json({ ok: false, error: 'Esta jugada ya terminó' }, 409);

    /* el servidor recalcula los gramos: el navegador solo informa cuándo frenó */
    const scoops = [];
    let esperado = 0, suma = 0;
    for (let i = 0; i < REGLAS.scoops; i++) {
      const v = t.v[i];
      const tope = (REGLAS.derrame / v) * 1000;
      const ms = Number(b.tiempos[i]);
      const derramo = b.tiempos[i] == null || !Number.isFinite(ms) || ms < 0 || ms >= tope;
      const g = derramo ? REGLAS.derrame : (v * ms) / 1000;
      esperado += t.r[i] + (derramo ? tope : ms);
      const err = g - REGLAS.objetivo;
      suma += Math.abs(err);
      scoops.push({ g: Math.round(g * 1000) / 1000, err: Math.round(err * 1000) / 1000, derramo });
    }
    const media = suma / REGLAS.scoops;
    /* ¿es físicamente posible? El tiempo real entre iniciar y finalizar no puede ser menor que
       lo que duraron los tres scoops. Y un error medio por debajo del piso no es humano. */
    const imposible = transcurrido + REGLAS.holguraTiempo < esperado;
    const pct = imposible || media < REGLAS.piso ? 0 : premioPara(media);

    let codigo = null, vence = null;
    const cierre = await env.DB.prepare('UPDATE scoop_jugadas SET media = ?, pct = ? WHERE dia = ? AND jugador = ? AND media IS NULL').bind(media, pct, t.d, jugador).run();
    if (!cierre.meta.changes) return json({ ok: false, error: 'Esta jugada ya terminó' }, 409);

    if (pct > 0) {
      vence = new Date(Date.now() + REGLAS.validezHoras * 3600 * 1000).toISOString();
      for (let intento = 0; intento < 4 && !codigo; intento++) {
        const c = `SCOOP${pct}${codigoAzar(5)}`;
        try {
          await env.DB.prepare("INSERT INTO cupones (codigo, tipo, valor, max_usos, min_total, vence_en) VALUES (?, 'porcentaje', ?, 1, 0, ?)").bind(c, pct, vence).run();
          codigo = c;
        } catch (e) {
          try { // base sin la columna vence_en: el cupón se crea igual, sin fecha de vencimiento
            await env.DB.prepare("INSERT INTO cupones (codigo, tipo, valor, max_usos, min_total) VALUES (?, 'porcentaje', ?, 1, 0)").bind(c, pct).run();
            codigo = c; vence = null;
          } catch (e2) { /* colisión de código: se reintenta */ }
        }
      }
      if (codigo) await env.DB.prepare('UPDATE scoop_jugadas SET codigo = ? WHERE dia = ? AND jugador = ?').bind(codigo, t.d, jugador).run();
    }
    return json({ ok: true, media: Math.round(media * 1000) / 1000, pct: codigo ? pct : 0, codigo, vence, scoops });
  }

  return json({ ok: false, error: 'Acción desconocida' }, 400);
}
