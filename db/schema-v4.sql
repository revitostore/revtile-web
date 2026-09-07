-- ===== Migración v4 de REVTILE: archivar pedidos =====
--
-- Qué hace: agrega una columna para marcar un pedido como archivado.
-- Un pedido archivado desaparece de la lista del panel pero sigue en la
-- base de datos, así que se puede recuperar. El borrado definitivo es
-- una acción aparte, con confirmación, dentro del archivo.
--
-- Es una migración segura: solo AGREGA una columna con valor por
-- defecto. No borra nada, no cambia ningún dato existente, y el panel
-- actual sigue funcionando igual si esto no se ejecuta.
--
-- Dónde ejecutarla:
--   Cloudflare Dashboard → Workers y Pages → D1 → revtile-db → Console
--   Pegar este archivo completo y ejecutar.
--
-- Para revertirla (si algo sale mal):
--   ALTER TABLE pedidos DROP COLUMN archivado_en;

ALTER TABLE pedidos ADD COLUMN archivado_en TEXT DEFAULT NULL;

-- El índice hace que "dame los pedidos activos" siga siendo instantáneo
-- aunque el archivo crezca con los años.
CREATE INDEX IF NOT EXISTS idx_pedidos_archivado ON pedidos(archivado_en);
