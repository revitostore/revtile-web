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
 */

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
        /* base64url -> base64 CON relleno: sin los '=' finales, atob falla
           según la longitud del token (por eso el acceso era intermitente) */
        let b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        b64 += '='.repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(atob(b64));
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
      /* Por defecto la lista muestra solo los pedidos activos. El
         archivo se pide aparte con ?archivados=1, para que nada
         archivado reaparezca por accidente en la operacion del dia. */
      cond.push(url.searchParams.get('archivados') === '1'
        ? 'archivado_en IS NOT NULL'
        : 'archivado_en IS NULL');
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

      return json({ ok: true, actualizado: res.meta.changes > 0 });
    }


    /* --- Archivar y desarchivar ---
       Un pedido archivado sale de la lista pero sigue completo en la
       base de datos. Reversible con un clic. */
    if (ruta === 'archivar' && request.method === 'POST') {
      const b = await request.json();
      const id = String(b.id || '').trim().toUpperCase();
      if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);
      const volver = b.deshacer === true;
      const res = await env.DB
        .prepare('UPDATE pedidos SET archivado_en = ' + (volver ? 'NULL' : "datetime('now')") + ' WHERE id = ?')
        .bind(id).run();
      if (!res.meta.changes) return json({ ok: false, error: 'No existe ese pedido' }, 404);
      return json({ ok: true, archivado: !volver });
    }

    /* --- Eliminar definitivamente ---
       Solo sobre un pedido YA archivado, y el cliente tiene que mandar
       de vuelta el mismo id como confirmacion. Las dos condiciones
       existen para que ningun clic suelto borre una venta. Hace falta
       para poder atender una solicitud de supresion de datos, que el
       titular puede pedir (Ley 1581 de 2012). */
    if (ruta === 'eliminar' && request.method === 'POST') {
      const b = await request.json();
      const id = String(b.id || '').trim().toUpperCase();
      if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);
      if (String(b.confirmar || '').trim().toUpperCase() !== id) {
        return json({ ok: false, error: 'Escribe el número del pedido para confirmar' }, 400);
      }
      const fila = await env.DB
        .prepare('SELECT archivado_en FROM pedidos WHERE id = ?').bind(id).first();
      if (!fila) return json({ ok: false, error: 'No existe ese pedido' }, 404);
      if (!fila.archivado_en) {
        return json({ ok: false, error: 'Archívalo primero. Solo se puede eliminar desde el archivo.' }, 409);
      }
      await env.DB.prepare('DELETE FROM pedidos WHERE id = ?').bind(id).run();
      return json({ ok: true, eliminado: id });
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


    return json({ ok: false, error: 'Ruta no encontrada' }, 404);
  } catch (e) {
    return json({ ok: false, error: 'Error del sistema: ' + (e.message || 'desconocido') }, 500);
  }
}
