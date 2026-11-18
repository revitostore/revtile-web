/* GENERADO por tools/build-suplementos.mjs desde productos.json. No editar a mano.
   El servidor NO confía en los precios que manda el navegador: recalcula cada pedido con esto.
   SUPLEMENTOS: stock base y precio; lo vendido se descuenta en /api/stock y /api/pedido. */
export interface Suplemento { stock: number; precio: number; nombre: string }
export interface Creatina { precio: number; nombre: string }
export const SUPLEMENTOS: Record<string, Suplemento> = {
  "wgs:dobles": {
    "stock": 2,
    "precio": 250000,
    "nombre": "Optimum Nutrition Gold Standard 100% Whey · Double Rich Chocolate"
  },
  "wgs:extreme": {
    "stock": 1,
    "precio": 250000,
    "nombre": "Optimum Nutrition Gold Standard 100% Whey · Extreme Milk Chocolate"
  },
  "outrage:blue": {
    "stock": 2,
    "precio": 120000,
    "nombre": "Nutrex Research Outrage Ultra Stim Pre-Workout · Blue Raspberry"
  },
  "outrage:fruit": {
    "stock": 1,
    "precio": 120000,
    "nombre": "Nutrex Research Outrage Ultra Stim Pre-Workout · Fruit Punch"
  },
  "bcaa:blue": {
    "stock": 2,
    "precio": 120000,
    "nombre": "Rule 1 BCAA 2:1:1 · Blue Raspberry"
  },
  "bcaa:fruit": {
    "stock": 1,
    "precio": 120000,
    "nombre": "Rule 1 BCAA 2:1:1 · Fruit Punch"
  },
  "vitaform:unica": {
    "stock": 3,
    "precio": 90000,
    "nombre": "AllMax Nutrition Premium Vitaform"
  }
};
export const CREATINAS: Record<string, Creatina> = {
  "on": {
    "precio": 120000,
    "nombre": "Optimum Nutrition Micronized Creatine Powder 300 g"
  },
  "mt": {
    "precio": 140000,
    "nombre": "MuscleTech Platinum Creatine Monohydrate 400 g"
  },
  "on120": {
    "precio": 170000,
    "nombre": "Optimum Nutrition Micronized Creatine Powder 600 g"
  }
};
export const COMBO_POR_PAR: number = 10000;
/* Cuántos días dura una unidad (una porción por día): sirve para avisar cuándo se le acaba al cliente. */
export const DURACION: Record<string, number> = {
  "on": 60,
  "mt": 80,
  "on120": 120,
  "wgs:dobles": 29,
  "wgs:extreme": 28,
  "outrage:blue": 30,
  "outrage:fruit": 30,
  "bcaa:blue": 30,
  "bcaa:fruit": 30,
  "vitaform:unica": 30
};
