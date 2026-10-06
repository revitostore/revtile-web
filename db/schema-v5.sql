-- ===== Migración v5 de REVTILE: el juego del scoop y los cupones que vencen =====
--
-- Qué hace:
--   1. Agrega `vence_en` a los cupones, para que el cupón del scoop dure 48 horas.
--   2. Crea `scoop_jugadas`: una fila por jugador y día, para que haya UNA jugada al día
--      y para que el servidor (no el navegador) decida el premio.
--
-- Es una migración segura: solo AGREGA una columna (nula por defecto) y una tabla nueva.
-- No borra nada ni cambia datos existentes. Si no se ejecuta, la tienda sigue funcionando
-- igual y el juego simplemente no aparece.
--
-- Dónde ejecutarla:
--   Cloudflare Dashboard → Workers y Pages → D1 → revtile-db → Console
--   Pegar este archivo completo y ejecutar.
--   (si D1 avisa que `vence_en` ya existe, ignora ese aviso)
--
-- Variable que también necesita el juego (la firma de cada jugada):
--   Pages → revtile-web → Settings → Variables and Secrets → SCOOP_SECRET = (una frase larga al azar)
--   Si no existe, el juego usa otra llave que ya tienes (WOMPI_INTEGRITY o ADMIN_KEY).
--   Después de crear una variable hay que hacer "Retry deployment".
--
-- Para revertirla:
--   DROP TABLE scoop_jugadas;
--   ALTER TABLE cupones DROP COLUMN vence_en;

ALTER TABLE cupones ADD COLUMN vence_en TEXT;   -- fecha ISO en UTC; NULL = no vence

CREATE TABLE IF NOT EXISTS scoop_jugadas (
  dia        TEXT NOT NULL,                      -- AAAA-MM-DD en hora de Bogotá
  jugador    TEXT NOT NULL,                      -- identificador anónimo guardado en el navegador
  ip         TEXT,                               -- huella corta de la IP, para frenar abusos
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  media      REAL,                               -- error medio en gramos (NULL = jugada sin terminar)
  pct        INTEGER,                            -- 0, 1, 3 o 5
  codigo     TEXT,                               -- cupón emitido, si ganó algo
  PRIMARY KEY (dia, jugador)
);

CREATE INDEX IF NOT EXISTS idx_scoop_ip ON scoop_jugadas(dia, ip);
