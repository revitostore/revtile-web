/* ===== API de administración Revtile =====
   Dos formas de entrar (el centro de mando gestion.html las prueba en orden):
   1. Cloudflare Access: si /gestion.html y /api/admin/* están detrás de una app de
      Access, Cloudflare ya autenticó el correo y manda el header
      'cf-access-authenticated-user-email'. ADMIN_EMAILS (lista separada por comas)
      limita qué correos mandan. ⚠️ ADMIN_EMAILS solo debe definirse cuando Access
      esté activo sobre AMBAS rutas (sin Access, ese header podría falsificarse).
   2. Llave de respaldo: header 'x-admin-key' igual a la variable secreta ADMIN_KEY.

   GET  /api/admin/pedidos?estado=nuevo&q=ana   → lista de pedidos (máx 200)
   POST /api/admin/pedido   {id, estado?, guia?, transportadora?, nota?} → actualizar
   GET  /api/admin/cupones                      → lista de cupones
   POST /api/admin/cupon    {codigo, tipo, valor, max_usos?, min_total?, activo?} → crear/editar

   REVTILE VERIFY (un registro por unidad fisica, no por pedido):
   GET  /api/admin/verify?pedido=RV-XXXXX  → registros de ese pedido
   GET  /api/admin/verify?ultimos=1        → los ultimos 50 registros
   POST /api/admin/verify        {pedido_id?, sku, lote, vence, sello, sello_nota?, nota_interna?}
   POST /api/admin/verify/foto   multipart: codigo + foto (hasta 4 por registro)
   POST /api/admin/verify/anular {codigo, motivo} */

import { nuevoCodigo, RE_CODIGO, normalizarCodigo, producto } from '../_verify-lib.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const ESTADOS = ['nuevo', 'verificado', 'despachado', 'entregado', 'cancelado'];

export async function onRequest(context) {
  const { request, env, params } = context;

  /* candado doble: correo autenticado por Access, o llave de respaldo.
     El correo puede venir en el header directo o dentro del JWT de Access
     (solo confiamos en él porque Access bloquea esta ruta en el borde). */
  let correoAccess = (request.headers.get('cf-access-authenticated-user-email') || '').toLowerCase();
  if (!correoAccess) {
    const jwt = request.headers.get('cf-access-jwt-assertion')
      || (request.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
    if (jwt) {
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        correoAccess = String(payload.email || '').toLowerCase();
      } catch (e) { /* token ilegible: seguimos sin correo */ }
    }
  }
  const permitidos = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const porAccess = !!correoAccess && permitidos.length > 0 && permitidos.includes(correoAccess);
  const porClave = !!env.ADMIN_KEY && request.headers.get('x-admin-key') === env.ADMIN_KEY;

  if (!porAccess && !porClave) {
    if (!env.ADMIN_KEY && !permitidos.length) {
      return json({ ok: false, error: 'Panel no configurado (falta ADMIN_KEY o ADMIN_EMAILS)' }, 503);
    }
    return json({ ok: false, error: 'Acceso denegado' }, 401);
  }

  const ruta = (params.path || []).join('/');
  const url = new URL(request.url);

  try {
    /* --- Pedidos --- */
    if (ruta === 'pedidos' && request.method === 'GET') {
      const estado = url.searchParams.get('estado');
      const q = (url.searchParams.get('q') || '').trim();
      let sql = 'SELECT * FROM pedidos';
      const binds = [];
      const cond = [];
      if (estado && ESTADOS.includes(estado)) { cond.push('estado = ?'); binds.push(estado); }
      if (q) {
        cond.push('(id LIKE ? OR nombre LIKE ? OR telefono LIKE ? OR ciudad LIKE ?)');
        const like = '%' + q + '%';
        binds.push(like, like, like, like);
      }
      if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
      sql += ' ORDER BY creado_en DESC LIMIT 200';
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return json({ ok: true, pedidos: results });
    }

    if (ruta === 'pedido' && request.method === 'POST') {
      const b = await request.json();
      const id = String(b.id || '').trim().toUpperCase();
      if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);

      const sets = [];
      const binds = [];
      if (b.estado !== undefined) {
        if (!ESTADOS.includes(b.estado)) return json({ ok: false, error: 'Estado inválido' }, 400);
        sets.push('estado = ?'); binds.push(b.estado);
      }
      if (b.guia !== undefined) { sets.push('guia = ?'); binds.push(String(b.guia).trim().slice(0, 60) || null); }
      if (b.transportadora !== undefined) { sets.push('transportadora = ?'); binds.push(String(b.transportadora).trim().slice(0, 40) || null); }
      if (b.nota !== undefined) { sets.push('nota = ?'); binds.push(String(b.nota).slice(0, 500) || null); }
      if (!sets.length) return json({ ok: false, error: 'Nada que actualizar' }, 400);

      binds.push(id);
      const res = await env.DB.prepare(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

      /* al despachar, la fecha de despacho queda sellada en los registros
         VERIFY de ese pedido. Un paso menos que hacer a mano. */
      if (b.estado === 'despachado') {
        try {
          await env.DB.prepare(
            `UPDATE verificaciones SET despachado_en = datetime('now')
             WHERE pedido_id = ? AND despachado_en IS NULL AND estado = 'activo'`
          ).bind(id).run();
        } catch (e) { /* base sin migrar a v3: el pedido se actualiza igual */ }
      }

      return json({ ok: true, actualizado: res.meta.changes > 0 });
    }

    /* --- Cupones --- */
    if (ruta === 'cupones' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM cupones ORDER BY creado_en DESC').all();
      return json({ ok: true, cupones: results });
    }

    if (ruta === 'cupon' && request.method === 'POST') {
      const b = await request.json();
      const codigo = String(b.codigo || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{3,20}$/.test(codigo)) return json({ ok: false, error: 'Código: 3-20 letras/números, sin espacios' }, 400);
      const tipo = b.tipo === 'fijo' ? 'fijo' : 'porcentaje';
      const valor = Math.round(Number(b.valor));
      if (!Number.isFinite(valor) || valor <= 0) return json({ ok: false, error: 'Valor inválido' }, 400);
      if (tipo === 'porcentaje' && valor > 90) return json({ ok: false, error: 'Máximo 90%' }, 400);

      await env.DB.prepare(
        `INSERT INTO cupones (codigo, tipo, valor, max_usos, min_total, activo)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(codigo) DO UPDATE SET
           tipo = excluded.tipo, valor = excluded.valor, max_usos = excluded.max_usos,
           min_total = excluded.min_total, activo = excluded.activo`
      ).bind(
        codigo, tipo, valor,
        b.max_usos ? Math.round(Number(b.max_usos)) : null,
        b.min_total ? Math.round(Number(b.min_total)) : 0,
        b.activo === false || b.activo === 0 ? 0 : 1
      ).run();
      return json({ ok: true, codigo });
    }


    /* --- REVTILE VERIFY --- */
    if (ruta === 'verify' && request.method === 'GET') {
      const pedido = (url.searchParams.get('pedido') || '').trim().toUpperCase();
      const sql = pedido
        ? 'SELECT * FROM verificaciones WHERE pedido_id = ? ORDER BY creado_en DESC'
        : 'SELECT * FROM verificaciones ORDER BY creado_en DESC LIMIT 50';
      const st = pedido ? env.DB.prepare(sql).bind(pedido) : env.DB.prepare(sql);
      const { results } = await st.all();
      return json({
        ok: true,
        registros: results.map((r) => ({ ...r, producto: producto(r.sku) })),
        fotos_activas: !!env.VERIFY_FOTOS,
      });
    }

    if (ruta === 'verify' && request.method === 'POST') {
      const b = await request.json();
      const sku = String(b.sku || '').trim();
      if (!['on', 'mt', 'on120'].includes(sku)) return json({ ok: false, error: 'Producto inválido' }, 400);

      const pedidoId = String(b.pedido_id || '').trim().toUpperCase() || null;
      if (pedidoId && !/^RV-[A-Z0-9]{4,8}$/.test(pedidoId))
        return json({ ok: false, error: 'Número de pedido inválido' }, 400);

      const lote = String(b.lote || '').trim().toUpperCase().slice(0, 40) || null;
      const vence = String(b.vence || '').trim().slice(0, 10) || null;
      if (vence && !/^\d{2}\/\d{4}$/.test(vence))
        return json({ ok: false, error: 'La fecha de vencimiento va como MM/AAAA' }, 400);

      const sello = b.sello === 'observaciones' ? 'observaciones' : 'integro';
      const selloNota = sello === 'observaciones'
        ? String(b.sello_nota || '').trim().slice(0, 240) || null
        : null;
      if (sello === 'observaciones' && !selloNota)
        return json({ ok: false, error: 'Si el sello tiene observaciones, escribe cuáles' }, 400);

      /* colisión de código: imposible en la práctica (45 bits), pero se
         reintenta igual antes de fallar */
      let codigo = null;
      for (let intento = 0; intento < 5 && !codigo; intento++) {
        const c = nuevoCodigo();
        const r = await env.DB.prepare(
          `INSERT OR IGNORE INTO verificaciones
             (codigo, pedido_id, sku, lote, vence, sello, sello_nota, inspector, nota_interna)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(
          c, pedidoId, sku, lote, vence, sello, selloNota,
          correoAccess || 'panel',
          String(b.nota_interna || '').trim().slice(0, 500) || null
        ).run();
        if (r.meta.changes > 0) codigo = c;
      }
      if (!codigo) return json({ ok: false, error: 'No se pudo generar el código' }, 500);

      return json({ ok: true, codigo, url: `/verify.html?c=${codigo}`, fotos_activas: !!env.VERIFY_FOTOS });
    }

    if (ruta === 'verify/anular' && request.method === 'POST') {
      const b = await request.json();
      const codigo = normalizarCodigo(b.codigo);
      if (!RE_CODIGO.test(codigo)) return json({ ok: false, error: 'Código inválido' }, 400);
      const motivo = String(b.motivo || '').trim().slice(0, 240);
      if (!motivo) return json({ ok: false, error: 'Escribe el motivo de la anulación' }, 400);
      const r = await env.DB.prepare(
        "UPDATE verificaciones SET estado = 'anulado', motivo_anulacion = ? WHERE codigo = ?"
      ).bind(motivo, codigo).run();
      return json({ ok: true, anulado: r.meta.changes > 0 });
    }

    if (ruta === 'verify/foto' && request.method === 'POST') {
      if (!env.VERIFY_FOTOS)
        return json({ ok: false, error: 'Falta configurar el bucket R2 (binding VERIFY_FOTOS)' }, 503);

      const form = await request.formData();
      const codigo = normalizarCodigo(form.get('codigo'));
      const archivo = form.get('foto');
      if (!RE_CODIGO.test(codigo)) return json({ ok: false, error: 'Código inválido' }, 400);
      if (!archivo || typeof archivo === 'string') return json({ ok: false, error: 'Falta la foto' }, 400);
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type || ''))
        return json({ ok: false, error: 'La foto debe ser JPG, PNG o WEBP' }, 400);
      if (archivo.size > 6 * 1024 * 1024) return json({ ok: false, error: 'La foto pesa más de 6 MB' }, 400);

      const fila = await env.DB.prepare('SELECT fotos FROM verificaciones WHERE codigo = ?').bind(codigo).first();
      if (!fila) return json({ ok: false, error: 'Ese registro no existe' }, 404);

      let claves = [];
      try { claves = JSON.parse(fila.fotos || '[]'); } catch (e) { claves = []; }
      if (claves.length >= 4) return json({ ok: false, error: 'Ya hay 4 fotos en este registro' }, 400);

      const ext = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
      const clave = `verify/${codigo}/${claves.length}.${ext}`;
      await env.VERIFY_FOTOS.put(clave, archivo.stream(), {
        httpMetadata: { contentType: archivo.type, cacheControl: 'public, max-age=31536000, immutable' },
      });

      claves.push(clave);
      await env.DB.prepare('UPDATE verificaciones SET fotos = ? WHERE codigo = ?')
        .bind(JSON.stringify(claves), codigo).run();

      return json({ ok: true, fotos: claves.length });
    }

    return json({ ok: false, error: 'Ruta no encontrada' }, 404);
  } catch (e) {
    return json({ ok: false, error: 'Error del sistema: ' + (e.message || 'desconocido') }, 500);
  }
}
