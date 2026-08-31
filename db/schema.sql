-- ===== Esquema D1 de REVTILE =====
-- Ejecutar en: Cloudflare Dashboard → Workers y Pages → D1 → revtile-db → Console
-- (pegar todo este archivo y ejecutar)

CREATE TABLE IF NOT EXISTS pedidos (
  id             TEXT PRIMARY KEY,            -- RV-XXXXX (generado en el checkout)
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  estado         TEXT NOT NULL DEFAULT 'nuevo', -- nuevo | verificado | despachado | entregado | cancelado
  metodo_pago    TEXT NOT NULL,               -- anticipado | contraentrega
  entrega_dia    TEXT,                        -- solo entregas programadas (Bogotá + anticipado)
  entrega_hora   TEXT,
  items          TEXT NOT NULL,               -- JSON: [{k,c,nombre,valor}]
  subtotal       INTEGER NOT NULL,
  combo          INTEGER NOT NULL DEFAULT 0,
  envio          INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL,
  nombre         TEXT NOT NULL,
  telefono       TEXT NOT NULL,
  ciudad         TEXT NOT NULL,
  direccion      TEXT NOT NULL,
  vivienda       TEXT,
  apto           TEXT,
  porteria       INTEGER NOT NULL DEFAULT 0,
  direccion_mapa TEXT,
  lat            REAL,
  lng            REAL,
  nota           TEXT                          -- notas internas (se llenan desde el panel admin futuro)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_creado ON pedidos(creado_en);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefono ON pedidos(telefono);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
