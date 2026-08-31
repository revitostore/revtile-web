-- ===== Migración v2: rastreo, cupones y guías de envío =====
-- Ejecutar en: Cloudflare Dashboard → D1 → revtile-db → Console
-- (pegar todo y Execute; si una columna ya existe, D1 avisa y puedes ignorar esa línea)

ALTER TABLE pedidos ADD COLUMN guia TEXT;            -- número de guía (Skydropx/transportadora)
ALTER TABLE pedidos ADD COLUMN transportadora TEXT;  -- coordinadora | servientrega | interrapidisimo | envia | tcc | deprisa | otra
ALTER TABLE pedidos ADD COLUMN cupon TEXT;           -- código de cupón aplicado
ALTER TABLE pedidos ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cupones (
  codigo    TEXT PRIMARY KEY,          -- se guarda en MAYÚSCULAS (ej. GYMBRO10)
  tipo      TEXT NOT NULL,             -- 'porcentaje' | 'fijo'
  valor     INTEGER NOT NULL,          -- 10 (=10%) o 10000 (=$10.000)
  activo    INTEGER NOT NULL DEFAULT 1,
  usos      INTEGER NOT NULL DEFAULT 0,
  max_usos  INTEGER,                   -- NULL = ilimitado
  min_total INTEGER NOT NULL DEFAULT 0,-- compra mínima para aplicar
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ejemplo (borrar o editar): 10% de descuento, máximo 50 usos, compra mínima $100.000
-- INSERT INTO cupones (codigo, tipo, valor, max_usos, min_total) VALUES ('GYMBRO10', 'porcentaje', 10, 50, 100000);
