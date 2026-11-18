-- ===== Migración v6 de REVTILE: plataforma de datos y operación =====
--
-- Qué agrega (todo es NUEVO; no cambia ni borra ningún dato existente):
--   eventos      Eventos anónimos del sitio (vista, producto, canasta, inicio de pedido)
--                para medir el embudo de conversión. Sin IP, sin nombre, sin teléfono.
--   costos       Costo de cada producto, para calcular el margen real en el panel.
--   ajustes      Parámetros de reposición (tiempo de entrega del proveedor, cobertura).
--   estados_log  Historial de cambios de estado de cada pedido (para medir tiempos de entrega).
--   errores      Registro de errores del servidor, visible en la pestaña «Salud» del panel.
--   pedidos.recordar  1 si el cliente aceptó que le avisemos por WhatsApp cuando se le acabe.
--
-- Dónde ejecutarla:
--   Cloudflare Dashboard → Workers y Pages → D1 → revtile-db → Console
--   Pegar este archivo completo y ejecutar. Si D1 dice que la columna «recordar» ya existe, ignóralo.

CREATE TABLE IF NOT EXISTS eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  sesion     TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  ruta       TEXT,
  k          TEXT,
  disp       TEXT
);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(creado_en);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo, creado_en);
CREATE INDEX IF NOT EXISTS idx_eventos_sesion ON eventos(sesion, creado_en);

CREATE TABLE IF NOT EXISTS costos (
  k              TEXT PRIMARY KEY,
  costo          INTEGER NOT NULL CHECK (costo >= 0),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS estados_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id TEXT NOT NULL,
  estado    TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_estados_pedido ON estados_log(pedido_id);
CREATE INDEX IF NOT EXISTS idx_estados_estado ON estados_log(estado, creado_en);

CREATE TABLE IF NOT EXISTS errores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  ruta      TEXT,
  mensaje   TEXT
);
CREATE INDEX IF NOT EXISTS idx_errores_fecha ON errores(creado_en);

ALTER TABLE pedidos ADD COLUMN recordar INTEGER NOT NULL DEFAULT 0;
