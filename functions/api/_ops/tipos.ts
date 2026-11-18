/* Tipos compartidos del servidor: las variables y la base de datos que Cloudflare entrega a cada función. */

export interface Env {
  DB: D1Database;
  ADMIN_KEY?: string;
  ADMIN_EMAILS?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  RESEND_KEY?: string;
  NOTIF_EMAIL?: string;
  NOTIF_FROM?: string;
  SKYDROPX_CLIENT_ID?: string;
  SKYDROPX_CLIENT_SECRET?: string;
  WOMPI_PUBLIC?: string;
  WOMPI_INTEGRITY?: string;
  WOMPI_EVENTS?: string;
  GOOGLE_SA_JSON?: string;
}

/** Los estados de un pedido, en el orden en que avanzan (cancelado queda aparte). */
export const ESTADOS = ['nuevo', 'verificado', 'despachado', 'entregado'] as const;
export type Estado = (typeof ESTADOS)[number] | 'cancelado';
