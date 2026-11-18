/* ===== API de pedidos Revtile (Cloudflare Pages Function) =====
   POST /api/pedido — valida y guarda el pedido en D1 (binding: DB), aplica cupón
   y envía aviso por email (si RESEND_KEY está configurada).
   Si algo falla, devuelve error y el checkout usa su respaldo por WhatsApp.

   SEGURIDAD: el navegador nunca decide cuánto se paga. Cada línea se valida contra el catálogo
   del servidor (_catalogo.js), y subtotal, combo, cupón y total se RECALCULAN aquí. Si el total
   que manda el navegador no coincide, el pedido se rechaza. */

import type { Env } from './_ops/tipos.ts';
import { json, propio } from './_ops/http.ts';
import { validarCupon } from './cupon.ts';
import { copiarAHoja } from './_sheets.ts';
import { SUPLEMENTOS, CREATINAS, COMBO_POR_PAR } from './_catalogo.ts';
import { registrarEstado } from './_ops/envios.ts';
import { registrarError } from './_ops/log.ts';
import { reservadas } from './stock.ts';

const fmt = (n: unknown): string => '$' + Number(n || 0).toLocaleString('es-CO');
const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v: unknown): string => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ENTIDADES[c]);

interface LineaPedido { k: string; c: number; nombre: string; valor: number }
interface AvisoPedido {
  id: string; metodo_pago: string; items: LineaPedido[]; total: number; nombre: string; telefono: string;
  ciudad: string; direccion: string; entrega_dia?: string; entrega_hora?: string; cupon: string | null; descuento: number;
}

const MAX_LINEAS = 20;       // líneas distintas por pedido
const MAX_POR_LINEA = 10;    // unidades de un mismo producto
const MAX_POR_TELEFONO = 5;  // pedidos nuevos del mismo teléfono en 10 minutos

/* Aviso de pedido nuevo por email (Resend). Nunca bloquea el registro.
   Todo lo que escribe el cliente se escapa: el correo no puede llevar HTML ajeno. */
async function avisarPedido(env: Env, d: AvisoPedido): Promise<void> {
  if (!env.RESEND_KEY || !env.NOTIF_EMAIL) return;
  const items = d.items.map((i) => `${esc(i.c)}× ${esc(i.nombre)}`).join('<br>');
  const entrega = d.entrega_dia ? `Programada: <b>${esc(d.entrega_dia)} · ${esc(d.entrega_hora)}</b>` : 'Estándar (2-3 días hábiles)';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0d0f17;color:#f7f8fa;padding:24px;border-radius:14px">
      <h2 style="color:#e41c34;margin:0 0 4px">Pedido nuevo ${esc(d.id)}</h2>
      <p style="color:#9aa2b5;margin:0 0 16px">${d.metodo_pago === 'contraentrega' ? 'CONTRAENTREGA (cobrar al entregar)' : 'Pago anticipado (esperar comprobante o confirmación de Wompi)'}</p>
      <p>${items}</p>
      ${d.cupon ? `<p>Cupón <b>${esc(d.cupon)}</b>: −${fmt(d.descuento)}</p>` : ''}
      <p style="font-size:20px"><b>Total: ${fmt(d.total)}</b> (envío gratis)</p>
      <hr style="border-color:#2a2f45">
      <p><b>${esc(d.nombre)}</b><br><a href="https://wa.me/57${esc(d.telefono)}" style="color:#2de2e6">${esc(d.telefono)}</a><br>${esc(d.direccion)}, ${esc(d.ciudad)}</p>
      <p>${entrega}</p>
      <p><a href="https://revtile.com.co/gestion.html" style="color:#ffc24b">Abrir el centro de mando</a></p>
    </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_KEY },
      body: JSON.stringify({
        from: env.NOTIF_FROM || 'REVTILE <onboarding@resend.dev>',
        to: [env.NOTIF_EMAIL],
        subject: `Pedido ${d.id} — ${fmt(d.total)} (${d.metodo_pago})`,
        html,
      }),
    });
  } catch (e) { /* el aviso nunca tumba el pedido */ }
}

/* Aviso de stock bajo: cuando una venta deja un producto en 1 unidad o menos, llega un correo.
   (Pages no tiene tareas programadas; el aviso se dispara con la propia venta.) */
async function avisarStockBajo(env: Env, vendidos: { k: string; c: number }[]): Promise<void> {
  if (!env.RESEND_KEY || !env.NOTIF_EMAIL || !vendidos.length) return;
  try {
    const hechos = await reservadas(env.DB);
    const bajos = vendidos
      .map(({ k }) => ({ k, nombre: SUPLEMENTOS[k].nombre, queda: Math.max(0, SUPLEMENTOS[k].stock - (hechos[k] || 0)) }))
      .filter((x) => x.queda <= 1);
    if (!bajos.length) return;
    const lista = bajos.map((x) => `<li>${esc(x.nombre)}: ${x.queda === 0 ? '<b>agotado</b>' : 'queda 1 unidad'}</li>`).join('');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_KEY },
      body: JSON.stringify({
        from: env.NOTIF_FROM || 'REVTILE <onboarding@resend.dev>',
        to: [env.NOTIF_EMAIL],
        subject: 'Stock bajo en REVTILE',
        html: `<p>Después del último pedido:</p><ul>${lista}</ul><p>Revisa la pestaña Inventario del Centro de mando para ver cuánto reponer.</p>`,
      }),
    });
  } catch (e) { /* el aviso nunca tumba el pedido */ }
}

export async function onRequestPost(context: EventContext<Env, string, unknown>): Promise<Response> {
  const { request, env } = context;
  /* el cuerpo es JSON y nada más: así ningún formulario de otro sitio puede mandar un pedido */
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) return json({ ok: false, error: 'Formato no admitido' }, 415);
  let p: Record<string, any>;
  try {
    p = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'JSON inválido' }, 400);
  }
  if (!p || typeof p !== 'object') return json({ ok: false, error: 'JSON inválido' }, 400);

  /* honeypot: los bots llenan el campo oculto — respondemos ok falso y no guardamos */
  if (p.web) return json({ ok: true, id: String(p.id || 'RV-OK').slice(0, 12) });

  /* validación de campos mínimos */
  const id = String(p.id || '').trim();
  const nombre = String(p.nombre || '').trim().slice(0, 120);
  const telefono = String(p.telefono || '').replace(/\D/g, '');
  const ciudad = String(p.ciudad || '').trim().slice(0, 80);
  const direccion = String(p.direccion || '').trim().slice(0, 200);
  const metodo = ['contraentrega', 'wompi'].includes(p.metodo_pago) ? p.metodo_pago : 'anticipado';

  if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);
  if (!nombre) return json({ ok: false, error: 'Falta el nombre' }, 400);
  if (!/^3\d{9}$/.test(telefono)) return json({ ok: false, error: 'Teléfono inválido' }, 400);
  if (!ciudad || !direccion) return json({ ok: false, error: 'Faltan datos de entrega' }, 400);

  /* Líneas del pedido: cada una debe existir en el catálogo; nombre y precio salen del servidor.
     Las unidades iguales se suman antes de comprobar el stock. */
  const recibidos = Array.isArray(p.items) ? p.items : [];
  if (!recibidos.length) return json({ ok: false, error: 'Pedido vacío' }, 400);
  if (recibidos.length > MAX_LINEAS) return json({ ok: false, error: 'Demasiadas líneas en el pedido' }, 400);
  const items: LineaPedido[] = [];
  const pedidas: Record<string, number> = {};
  let unidades = 0;
  let subtotal = 0;
  for (const it of recibidos) {
    const k = String((it && it.k) || '');
    const c = Math.floor(Number(it && it.c));
    const esSup = propio(SUPLEMENTOS, k);
    const prod = esSup ? SUPLEMENTOS[k] : propio(CREATINAS, k) ? CREATINAS[k] : null;
    if (!prod) return json({ ok: false, error: 'Producto no disponible' }, 400);
    if (!(c >= 1) || c > MAX_POR_LINEA) return json({ ok: false, error: 'Cantidad inválida' }, 400);
    const valor = prod.precio * c;
    items.push({ k, c, nombre: prod.nombre, valor });
    subtotal += valor;
    unidades += c;
    if (esSup) pedidas[k] = (pedidas[k] || 0) + c;
  }
  const suplementos = Object.entries(pedidas).map(([k, c]) => ({ k, c }));
  for (const { k, c } of suplementos) {
    if (c > SUPLEMENTOS[k].stock) return json({ ok: false, error: `Solo hay ${SUPLEMENTOS[k].stock} de ${SUPLEMENTOS[k].nombre}`, agotado: k }, 409);
  }

  /* combo Gymbro: un descuento por cada par de productos */
  const combo = Math.floor(unidades / 2) * COMBO_POR_PAR;
  const base = subtotal - combo;
  const envio = 0;

  try {
    /* un reintento del MISMO pedido es legítimo (el cliente reabre WhatsApp): no se duplica ni se frena */
    const existente = await env.DB.prepare('SELECT id FROM pedidos WHERE id = ?').bind(id).first();
    if (existente) return json({ ok: true, id });

    /* freno contra el abuso: muchos pedidos nuevos desde el mismo teléfono en pocos minutos */
    try {
      const rec = await env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE telefono = ? AND creado_en > datetime('now', '-10 minutes')").bind(telefono).first<{ n: number }>();
      if (rec && rec.n >= MAX_POR_TELEFONO) return json({ ok: false, error: 'Demasiados pedidos seguidos. Espera unos minutos o escríbenos por WhatsApp.' }, 429);
    } catch (e) { /* si la consulta falla, el pedido sigue */ }

    /* cupón: re-validación en servidor sobre el total REAL (el cliente solo sugiere) */
    let cupon = null;
    let descuento = 0;
    if (p.cupon) {
      try {
        const codigo = String(p.cupon).trim().toUpperCase().slice(0, 20);
        const v = await validarCupon(env.DB, codigo, base);
        if (v.ok) { cupon = v.codigo; descuento = v.descuento; }
      } catch (e) { /* tabla cupones ausente: pedido sigue sin descuento */ }
    }
    const total = base - descuento + envio;
    if (total < 1000 || total > 5000000) return json({ ok: false, error: 'Total fuera de rango' }, 400);

    /* el total del navegador tiene que coincidir con el del servidor */
    if (Number(p.total) !== total) {
      return json({ ok: false, precio: true, error: 'El total cambió (precios o cupón). Recarga la página y revisa tu canasta.' }, 400);
    }

    /* INSERT OR IGNORE: si el mismo ID llega dos veces, no se duplica */
    const camposBase = [
      id,
      metodo,
      p.entrega_dia ? String(p.entrega_dia).slice(0, 40) : null,
      p.entrega_hora ? String(p.entrega_hora).slice(0, 20) : null,
      JSON.stringify(items).slice(0, 8000),
      subtotal,
      combo,
      envio,
      total,
      nombre,
      telefono,
      ciudad,
      direccion,
      p.vivienda ? String(p.vivienda).slice(0, 30) : null,
      p.apto ? String(p.apto).slice(0, 80) : null,
      p.porteria ? 1 : 0,
      p.direccion_mapa ? String(p.direccion_mapa).slice(0, 200) : null,
      p.lat && Number.isFinite(Number(p.lat)) ? Number(p.lat) : null,
      p.lng && Number.isFinite(Number(p.lng)) ? Number(p.lng) : null,
    ];
    /* Condición de stock dentro del mismo INSERT: la base cuenta lo ya vendido (pedidos no
       cancelados) y solo inserta si alcanza. Así dos personas comprando la última unidad a la vez
       no pueden llevársela las dos. */
    const condStock = suplementos.length
      ? suplementos.map(() => `(? - COALESCE((SELECT SUM(CAST(json_extract(j.value, '$.c') AS INTEGER))
            FROM pedidos pp, json_each(CASE WHEN json_valid(pp.items) THEN pp.items ELSE '[]' END) j
           WHERE json_extract(j.value, '$.k') = ? AND pp.estado <> 'cancelado'), 0)) >= ?`).join(' AND ')
      : '1';
    const bindStock = suplementos.flatMap((a) => [SUPLEMENTOS[a.k].stock, a.k, a.c]);
    const ph = (n: number) => Array(n).fill('?').join(',');
    /* El esquema de la base puede ir por detrás del código (migraciones v2 y v6 aún sin ejecutar):
       se intenta con todas las columnas y, si falta alguna, con menos. Nunca se pierde un pedido. */
    const recordar = p.recordar ? 1 : 0;
    const intentos = [
      { cols: ', cupon, descuento, recordar', vals: [cupon, descuento, recordar] },
      { cols: ', cupon, descuento', vals: [cupon, descuento] },
      { cols: '', vals: [] },
    ];
    let res: D1Result | undefined;
    let ultimoError: unknown;
    for (const it of intentos) {
      try {
        res = await env.DB.prepare(
          `INSERT OR IGNORE INTO pedidos
            (id, metodo_pago, entrega_dia, entrega_hora, items, subtotal, combo, envio, total,
             nombre, telefono, ciudad, direccion, vivienda, apto, porteria, direccion_mapa, lat, lng${it.cols})
           SELECT ${ph(19 + it.vals.length)} WHERE ${condStock}`
        ).bind(...camposBase, ...it.vals, ...bindStock).run();
        break;
      } catch (e) { ultimoError = e; }
    }
    if (!res) throw ultimoError;

    /* 0 filas: o el ID ya existía (reintento legítimo → idempotente) o se acabó el stock */
    if (res.meta.changes === 0) {
      const ya = await env.DB.prepare('SELECT id FROM pedidos WHERE id = ?').bind(id).first();
      if (!ya) return json({ ok: false, error: 'Alguien compró esa unidad justo antes que tú. Revisa tu canasta.', agotado: true }, 409);
    }

    /* solo si el pedido es nuevo (no repetido): contar uso del cupón y avisar */
    if (res.meta.changes > 0) {
      if (cupon) {
        await env.DB.prepare('UPDATE cupones SET usos = usos + 1 WHERE codigo = ?').bind(cupon).run();
      }
      context.waitUntil(registrarEstado(env, id, 'nuevo'));
      context.waitUntil(avisarStockBajo(env, suplementos));
      context.waitUntil(avisarPedido(env, {
        id, metodo_pago: metodo, items, total, nombre, telefono, ciudad, direccion,
        entrega_dia: p.entrega_dia, entrega_hora: p.entrega_hora, cupon, descuento,
      }));

      /* Copia a la hoja de calculo. Va dentro de waitUntil, igual que el
         aviso: corre DESPUES de responderle al cliente, asi que ni lo
         hace esperar ni puede tumbar la venta si Google falla. Se relee
         la fila para mandar exactamente lo que quedo guardado, no lo que
         creemos que se guardo. */
      context.waitUntil((async () => {
        try {
          const fila = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
          if (fila) await copiarAHoja(env, fila);
        } catch (e) {
          console.error('[sheets] fallo la copia de', id, (e as Error).message);
        }
      })());
    }

    return json({ ok: true, id, cupon, descuento });
  } catch (e) {
    /* DB no configurada o caída: el checkout usará el mensaje completo por WhatsApp */
    await registrarError(env, 'pedido', e);
    return json({ ok: false, error: 'DB no disponible' }, 500);
  }
}

/* métodos distintos de POST: Cloudflare Pages responde 405 automáticamente */
