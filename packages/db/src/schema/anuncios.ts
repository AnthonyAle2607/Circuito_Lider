import type { Generated } from 'kysely';

/** Migraciones 0006–0009: anuncios, palabras prohibidas, grabaciones y certificados. */
export type EstadoAnuncio = 'procesando' | 'aprobado' | 'en_revision' | 'rechazado';

export interface AnunciosTabla {
  id: Generated<string>;
  anunciante_id: string;
  subido_por: string;
  nombre: string;
  archivo_nombre: string;
  archivo_clave: string;
  formato: 'mp4' | 'mp3' | 'wav';
  bytes: number;
  duracion_ms: number | null;
  estado: Generated<EstadoAnuncio>;
  motivo: string | null;
  transcripcion: string | null;
  coincidencias: Generated<unknown>;
  intentos: Generated<number>;
  tomado_at: Date | null;
  revisado_por: string | null;
  revisado_at: Date | null;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface PalabrasProhibidasTabla {
  id: Generated<number>;
  palabra: string;
  categoria: string;
  activa: Generated<boolean>;
  creado_at: Generated<Date>;
}

export interface GrabacionesTabla {
  id: Generated<string>;
  emisora_id: string;
  archivo: string;
  inicio_at: Date;
  fin_at: Date;
  bytes: number;
  analizada_at: Date | null;
  borrada_at: Date | null;
  creado_at: Generated<Date>;
}

export interface CertificadosTabla {
  id: Generated<string>;
  anunciante_id: string;
  pedido_id: string;
  anuncio_id: string;
  reserva_id: string | null;
  emisora_id: string;
  grabacion_id: string;
  emitido_at: Date;
  duracion_ms: number;
  parecido: string;
  clip_clave: string;
  clip_sha256: Buffer;
  creado_at: Generated<Date>;
}
