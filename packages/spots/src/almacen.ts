import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Dónde viven los archivos de los spots. En producción usa el proveedor S3 configurado; en pruebas, memoria. */
export interface Almacen {
  guardar(clave: string, datos: Buffer, tipo: string): Promise<void>;
  leer(clave: string): Promise<Buffer>;
}

export interface ConfigS3 {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export function almacenS3(c: ConfigS3): Almacen {
  const s3 = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
  });
  let listo: Promise<void> | null = null;
  // El bucket se crea la primera vez que hace falta (en desarrollo MinIO arranca vacío).
  const asegurar = () =>
    (listo ??= s3
      .send(new HeadBucketCommand({ Bucket: c.bucket }))
      .then(() => undefined)
      .catch(async () => {
        await s3.send(new CreateBucketCommand({ Bucket: c.bucket })).catch((e: { name?: string }) => {
          if (e?.name !== 'BucketAlreadyOwnedByYou' && e?.name !== 'BucketAlreadyExists') throw e;
        });
      })
      .catch((e) => {
        listo = null;
        throw e;
      }));
  return {
    async guardar(clave, datos, tipo) {
      await asegurar();
      await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: clave, Body: datos, ContentType: tipo }));
    },
    async leer(clave) {
      const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: clave }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
}

/** Lee la configuración S3 del entorno (las mismas variables que `.env.example`). */
export function configS3DelEntorno(env: NodeJS.ProcessEnv = process.env): ConfigS3 | null {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) return null;
  return { endpoint: S3_ENDPOINT, region: S3_REGION ?? 'us-east-1', bucket: S3_BUCKET, accessKey: S3_ACCESS_KEY, secretKey: S3_SECRET_KEY };
}

/** Para pruebas y desarrollo sin MinIO. */
export function almacenEnMemoria(): Almacen & { claves(): string[] } {
  const m = new Map<string, Buffer>();
  return {
    async guardar(clave, datos) {
      m.set(clave, Buffer.from(datos));
    },
    async leer(clave) {
      const d = m.get(clave);
      if (!d) throw new Error(`no existe ${clave}`);
      return d;
    },
    claves: () => [...m.keys()],
  };
}
