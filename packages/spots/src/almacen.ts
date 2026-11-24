import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Dónde viven los archivos de spots, comprobantes y certificados. */
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

export function almacenLocal(directorio: string): Almacen {
  const raiz = resolve(directorio);
  const ruta = (clave: string) => {
    const archivo = resolve(raiz, clave);
    const relativa = relative(raiz, archivo);
    if (!relativa || relativa === '..' || relativa.startsWith(`..${sep}`) || isAbsolute(relativa)) {
      throw new Error(`clave de archivo fuera del almacén: ${clave}`);
    }
    return archivo;
  };
  return {
    async guardar(clave, datos) {
      const archivo = ruta(clave);
      await mkdir(dirname(archivo), { recursive: true });
      await writeFile(archivo, datos);
    },
    async leer(clave) {
      return readFile(ruta(clave));
    },
  };
}

/** Lee la configuración S3 del entorno (las mismas variables que `.env.example`). */
export function configS3DelEntorno(env: NodeJS.ProcessEnv = process.env): ConfigS3 | null {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) return null;
  return { endpoint: S3_ENDPOINT, region: S3_REGION ?? 'us-east-1', bucket: S3_BUCKET, accessKey: S3_ACCESS_KEY, secretKey: S3_SECRET_KEY };
}

/** Prefiere disco local si está configurado; S3 sigue disponible para desarrollo y otros despliegues. */
export function almacenDelEntorno(env: NodeJS.ProcessEnv = process.env): Almacen | null {
  if (env.SPOTS_DIR) return almacenLocal(env.SPOTS_DIR);
  const config = configS3DelEntorno(env);
  return config ? almacenS3(config) : null;
}

/** Para pruebas. */
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
