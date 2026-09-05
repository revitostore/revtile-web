/* ===== REVTILE VERIFY — utilidades compartidas =====
   Un registro por unidad física. El código es aleatorio y NO se deriva del
   pedido: de un código no se puede deducir a qué pedido pertenece. */

/* Base32 de Crockford sin I, L, O ni U: no hay forma de confundir 0 con O
   ni 1 con I al leer un código en voz alta o teclearlo desde un sticker. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/* RV-XXXXX-XXXX → 9 caracteres aleatorios = 45 bits.
   Adivinar uno a ciegas es inviable, y por eso no hace falta esconder el
   registro detrás de un login. El segundo grupo también lo distingue a
   simple vista del número de pedido, que es RV-XXXXX a secas. */
export function nuevoCodigo() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => ALFABETO[b % 32]).join('');
  return `RV-${c.slice(0, 5)}-${c.slice(5)}`;
}

export const RE_CODIGO = /^RV-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function normalizarCodigo(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  /* tolerante con quien teclea sin guiones o confunde O con 0 */
  const limpio = s.replace(/^RV-?/, '').replace(/-/g, '')
    .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/U/g, 'V');
  if (limpio.length !== 9) return s;
  return `RV-${limpio.slice(0, 5)}-${limpio.slice(5)}`;
}

/* Nombres legibles. Se mantienen aquí y no en base de datos para que
   renombrar un producto no obligue a migrar filas históricas. */
export const PRODUCTOS = {
  on:    { marca: 'Optimum Nutrition', nombre: 'Micronized Creatine Powder', presentacion: '300 g · 60 servicios' },
  mt:    { marca: 'MuscleTech',        nombre: 'Platinum Creatine Monohydrate', presentacion: '400 g · 80 servicios' },
  on120: { marca: 'Optimum Nutrition', nombre: 'Micronized Creatine Powder', presentacion: '600 g · 120 servicios' },
};

export function producto(sku) {
  return PRODUCTOS[sku] || { marca: '—', nombre: 'Producto', presentacion: '' };
}

/* Lo que se muestra en público. Todo lo que no esté en este objeto no sale
   de la base: ni pedido_id, ni inspector, ni nota_interna. */
export function vistaPublica(fila, tieneFotos) {
  const p = producto(fila.sku);
  const n = tieneFotos ? (JSON.parse(fila.fotos || '[]') || []).length : 0;
  return {
    codigo: fila.codigo,
    estado: fila.estado,
    motivo_anulacion: fila.estado === 'anulado' ? fila.motivo_anulacion || null : null,
    producto: `${p.marca} — ${p.nombre}`,
    presentacion: p.presentacion,
    lote: fila.lote || null,
    vence: fila.vence || null,
    sello: fila.sello || null,
    sello_nota: fila.sello_nota || null,
    inspeccionado_en: fila.inspeccionado_en || null,
    despachado_en: fila.despachado_en || null,
    fotos: Array.from({ length: n }, (_, i) => `/api/verify/foto?c=${encodeURIComponent(fila.codigo)}&i=${i}`),
  };
}
