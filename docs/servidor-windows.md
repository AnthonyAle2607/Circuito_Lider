# Servidor Windows (Windows Server 2019, sin Docker)

El Sistema de Pautas corre en Windows Server 2019 Standard con **servicios nativos de Windows**, no con Docker.

## Por qué sin Docker

En Windows Server 2019 no se pueden correr las imágenes de `infra/docker-compose.yml`:

- Docker Desktop no funciona en Windows Server.
- WSL2 llegó recién con Server 2022.
- Docker Engine en Server 2019 solo corre contenedores Windows, y Postgres, Redis y MinIO son imágenes Linux.

El compose se queda para desarrollar en los equipos de escritorio.

## Qué corre en el servidor

| Pieza | En el servidor | Puerto (solo 127.0.0.1) | Servicio de Windows |
|---|---|---|---|
| Base de datos | PostgreSQL 16 (instalador oficial de EDB) | 5433 | `postgresql-x64-16` |
| Colas y límites | Memurai (compatible con Redis 7) | 6380 | `Memurai` |
| Almacén S3 | MinIO (`minio.exe`) | 9100, consola 9101 | `PautasMinio` |
| API | Node 22 + tsx | 4100 | `PautasApi` |
| Trabajos | Node 22 + tsx | — | `PautasWorkers` |
| Portal | Next.js (`next start`) | 3100 | `PautasPortal` |
| Panel | Next.js (`next start`) | 3110 | `PautasPanel` |
| Grabador (opcional) | Node 22 + ffmpeg | — | `PautasGrabador` |

Los puertos son los mismos que en desarrollo, así el `.env` cambia solo en las claves. Los servicios `Pautas*` los registra `infra/windows/instalar-servicios.ps1` con NSSM; si se caen, vuelven a arrancar solos a los 5 segundos. Sus registros quedan en `registros\<servicio>.log` y rotan a los 10 MB.

## Antes de empezar: tres decisiones

1. **Licencia de Memurai.** Redis no tiene versión oficial para Windows. Memurai es la alternativa compatible:
   - Su edición Developer es gratis, pero no está pensada para producción.
   - Para producción se compra la edición Enterprise.

   BullMQ necesita algo compatible con Redis 6.2 o superior, y Memurai lo es. Verifica las condiciones vigentes en memurai.com antes de instalar.
2. **Descarga de MinIO.** En 2025 MinIO cambió cómo distribuye los binarios gratuitos. Antes de instalar, confirma que `minio.exe` para Windows siga disponible en su sitio oficial y en qué condiciones.
3. **`NODE_ENV`.** La pasarela de pagos de prueba se niega a arrancar con `NODE_ENV=production`, y por ahora es la única pasarela que hay ([pagos.md](pagos.md)). Por eso la API y los trabajos corren sin esa variable. El portal y el panel ya la usan por su cuenta con `next start`.

## Instalación (una sola vez)

Todo se hace en PowerShell como administrador.

### 1. Herramientas

- **Git.**
- **Node.js 22 LTS:** el instalador MSI, para todo el equipo.
- **pnpm:** activarlo con `corepack enable`.
- **NSSM:** descomprimirlo, por ejemplo en `C:\herramientas\nssm\nssm.exe`.
- **ffmpeg** y, si se transcriben spots, **whisper.cpp:** sus rutas van en `FFMPEG_BIN`, `WHISPER_BIN` y `WHISPER_MODEL` del `.env`.

Tras instalar Node, abre una consola nueva para que el `PATH` del sistema incluya `node` y `pnpm`. Los servicios corren como LocalSystem y usan ese `PATH`.

### 2. PostgreSQL 16

1. Instala PostgreSQL 16 con el instalador de EDB:
   - **Puerto:** 5433.
   - **Clave de `postgres`:** una clave fuerte. Esa clave va en `DATABASE_URL_MIGRATOR`.
2. Deja que escuche solo en el equipo. En `C:\Program Files\PostgreSQL\16\data\postgresql.conf`, pon `listen_addresses = 'localhost'` y reinicia el servicio.
3. Crea la base en UTC, igual que en Docker:

   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -p 5433 -U postgres pautas
   ```

   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -p 5433 -U postgres -d pautas -c "ALTER DATABASE pautas SET timezone TO 'UTC';"
   ```

### 3. Memurai

1. Instálalo.
2. En su `memurai.conf`, cambia estas líneas:

   ```
   port 6380
   bind 127.0.0.1
   appendonly yes
   ```

3. Reinicia el servicio `Memurai`.

### 4. MinIO

1. Guarda `minio.exe`, por ejemplo en `C:\herramientas\minio\minio.exe`.
2. No se configura nada más. El servicio lo crea el script del paso 6 y toma usuario y clave de `S3_ACCESS_KEY` y `S3_SECRET_KEY` del `.env`.
3. El bucket `pautas` lo crea la aplicación la primera vez que guarda un archivo.

### 5. El repositorio y el `.env`

```powershell
cd C:\sistema-de-pautas
```

```powershell
copy .env.example .env
```

Edita el `.env`. Debe vivir solo en el servidor, nunca en git ni en el vault:

- **`PAUTAS_SERVICIOS=nativos`:** hace que `pnpm iniciar` no busque Docker.
- **Claves de las URLs de la base:**
  - `DATABASE_URL_MIGRATOR` lleva la clave de `postgres` que pusiste al instalar.
  - `DATABASE_URL` (rol `app_api`) y `DATABASE_URL_WORKER` (rol `app_worker`) llevan claves nuevas y fuertes. `pnpm iniciar` se las asigna a esos roles.
- **`S3_SECRET_KEY`:** una clave real. El script se niega a usar `minio-dev-only`.
- **`MFA_KEY`, `PAGOS_PRUEBA_SECRETO` y `AVISOS_SECRETO`:** valores nuevos. El `.env.example` dice cómo generar cada uno.
- **`PORTAL_URL` y `API_URL_PUBLICA`:** las direcciones con que se llegará al servidor.
- **`AVISOS_EN_CONSOLA`:** quítalo cuando n8n reciba los avisos.

Después instala y compila:

```powershell
pnpm install --frozen-lockfile
```

```powershell
pnpm build
```

### 6. Servicios de Windows

```powershell
.\infra\windows\instalar-servicios.ps1 -Nssm C:\herramientas\nssm\nssm.exe -Minio C:\herramientas\minio\minio.exe
```

Antes de encender las apps, el script arranca MinIO y corre `pnpm iniciar --sin-apps`, que hace cuatro cosas:

1. Espera a Postgres, Memurai y MinIO.
2. Aplica las migraciones.
3. Asigna las claves de las URLs del `.env` a `app_api` y `app_worker`.
4. Carga la parrilla, el tarifario de ejemplo (solo si no hay ninguno) y las palabras prohibidas.

Si eso falla, no arranca ninguna app.

- Agrega `-ConGrabador` para grabar las emisoras.
- Si los servicios de Postgres o Memurai tienen otro nombre, pásalo con `-ServicioPostgres` y `-ServicioRedis`.
- El script se puede volver a correr: recrea los servicios.

Para comprobar que todo responde:

```powershell
Get-Service Pautas*
```

```powershell
Invoke-WebRequest http://127.0.0.1:4100/v1/ready -UseBasicParsing
```

## Cada actualización

```powershell
.\infra\windows\actualizar.ps1
```

El script hace esto, en orden:

1. Baja lo último de la rama con `git pull --ff-only`.
2. Detiene las apps. MinIO, Postgres y Memurai siguen arriba.
3. Instala las dependencias.
4. Compila el portal y el panel.
5. Aplica las migraciones nuevas.
6. Vuelve a arrancar las apps.

## Día a día

- **Ver registros:** `Get-Content registros\PautasApi.log -Tail 50 -Wait`.
- **Reiniciar una pieza:** `Restart-Service PautasApi`.
- **Apagar todo:** `Get-Service Pautas* | Stop-Service`.

## Pendiente para salir a internet (PT-8)

Los puertos solo escuchan en `127.0.0.1`. Para que clientes y equipo lleguen al portal y al panel faltan dos piezas:

- **Proxy inverso con HTTPS.** Caddy tiene versión para Windows y también se registra con NSSM.
- **Túnel o regla de firewall,** según se decida en PT-8.

Detrás del proxy, `TRUST_PROXY=1`.
