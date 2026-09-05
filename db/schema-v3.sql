-- ===== Migración v3: REVTILE VERIFY =====
-- Ejecutar en: Cloudflare Dashboard → D1 → revtile-db → Console
-- (pegar todo y Execute)
--
-- Es una migración PURAMENTE ADITIVA: crea una tabla nueva y no toca
-- `pedidos` ni `cupones`. Si algo sale mal, basta con DROP TABLE
-- verificaciones y el sitio sigue funcionando exactamente igual.
--
-- Antes de ejecutarla, exporta la tabla de pedidos por costumbre:
--   D1 → revtile-db → Console → SELECT * FROM pedidos;  → Export

-- Un registro por UNIDAD FÍSICA, no por pedido.
-- Un pedido con dos tarros genera dos filas, cada una con su lote.
CREATE TABLE IF NOT EXISTS verificaciones (
  codigo            TEXT PRIMARY KEY,             -- RV-XXXXX-XXXX (Base32 Crockford, aleatorio)
  pedido_id         TEXT,                         -- RV-XXXXX del pedido. NUNCA sale al público.
  sku               TEXT NOT NULL,                -- on | mt | on120
  lote              TEXT,                         -- número de lote impreso por el fabricante
  vence             TEXT,                         -- 'MM/AAAA' tal como viene impreso
  sello             TEXT NOT NULL DEFAULT 'integro', -- integro | observaciones
  sello_nota        TEXT,                         -- si hubo observaciones, cuáles
  inspector         TEXT,                         -- correo de quien inspeccionó (uso interno)
  inspeccionado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  despachado_en     TEXT,                         -- se sella al marcar el pedido como despachado
  fotos             TEXT NOT NULL DEFAULT '[]',   -- JSON: claves de los objetos en R2
  estado            TEXT NOT NULL DEFAULT 'activo', -- activo | anulado
  motivo_anulacion  TEXT,
  nota_interna      TEXT,                         -- NUNCA sale al público
  creado_en         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verif_pedido ON verificaciones(pedido_id);
CREATE INDEX IF NOT EXISTS idx_verif_lote   ON verificaciones(lote);
CREATE INDEX IF NOT EXISTS idx_verif_creado ON verificaciones(creado_en);

-- ─────────────────────────────────────────────────────────────────────
-- Después de ejecutar esto, en el proyecto Pages hace falta:
--
-- 1. (Opcional, para las fotos) Crear un bucket R2 llamado
--    `revtile-verify` y atarlo como binding con Variable name = VERIFY_FOTOS.
--    Sin ese binding, VERIFY funciona igual pero sin fotografías: la API
--    devuelve la lista vacía y el panel avisa de que faltan por configurar.
--
-- 2. Nada más. Los endpoints /api/verify y /api/admin/verify* se despliegan
--    solos con el próximo push.
-- ─────────────────────────────────────────────────────────────────────
