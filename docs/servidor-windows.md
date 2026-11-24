# Servidor Windows (Windows Server 2019, sin Docker)

El Sistema de Pautas corre en Windows Server 2019 Standard con **servicios nativos de Windows**, no con Docker.

## Por qué sin Docker

En Windows Server 2019 no se pueden correr las imágenes de `infra/docker-compose.yml`:

- Docker Desktop no funciona en Windows Server.
- WSL2 llegó recién con Server 2022.
- Docker Engine en Server 2019 solo corre contenedores Windows, y Postgres, Redis y MinIO son imágenes Linux.

El compose se queda para desarrollar en los equipos de escritorio.

## Qué corre en el servidor

| Pieza | En el servidor | Puerto/destino | Servicio de Windows |
|---|---|---|---|
| Base de datos | PostgreSQL 16 (Chocolatey) | 5433 | `postgresql-x64-16` |
| Colas y límites | Memurai (compatible con Redis 7, Chocolatey) | 6380 | `Memurai` |
| Archivos de anuncios y comprobantes | Disco local (`C:\datos\pautas\archivos`) | NTFS | `PautasApi`, `PautasWorkers` |
| API | Node 22 + tsx | 4100 | `PautasApi` |
| Trabajos | Node 22 + tsx | — | `PautasWorkers` |
| Portal | Next.js (`next start`) | 3100 | `PautasPortal` |
| Panel | Next.js (`next start`) | 3110 | `PautasPanel` |
| Grabador (opcional) | Node 22 + ffmpeg | — | `PautasGrabador` |

Los servicios `Pautas*` los registra `infra/windows/instalar-servicios.ps1` con NSSM; si se caen, vuelven a arrancar solos a los 5 segundos. Sus registros quedan en `registros\<servicio>.log` y rotan a los 10 MB.

## Antes de empezar

1. **Licencia de Memurai.** Redis no tiene versión oficial para Windows. Memurai es la alternativa compatible:
   - Su edición Developer es gratis, pero no está pensada para producción.
   - Para producción se compra la edición Enterprise.

   BullMQ necesita algo compatible con Redis 6.2 o superior, y Memurai lo es. Verifica las condiciones vigentes en memurai.com antes de instalar.
2. **Archivos locales.** No hace falta una cuenta de AWS ni pagar almacenamiento cloud. Los archivos quedan en el disco del servidor; configura copias de seguridad regulares y vigila el espacio disponible.
3. **`NODE_ENV`.** La pasarela de pagos de prueba se niega a arrancar con `NODE_ENV=production`, y por ahora es la única pasarela que hay ([pagos.md](pagos.md)). Por eso la API y los trabajos corren sin esa variable. El portal y el panel ya la usan por su cuenta con `next start`.

## Instalación (una sola vez)

Todo se hace en **PowerShell como administrador**, no en `cmd.exe`. Desde una consola `cmd` de administrador basta con escribir `powershell`.

Windows Server 2019 no trae `winget`, así que los programas se instalan con Chocolatey.

### 1. Chocolatey

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

Después cierra PowerShell y ábrelo otra vez como administrador.

### 2. Git, Node.js, NSSM y ffmpeg

```powershell
choco install git nodejs-lts nssm ffmpeg -y
```

Vuelve a abrir PowerShell para que el `PATH` incluya los programas nuevos. Luego instala pnpm en la versión del proyecto:

```powershell
npm install -g pnpm@9.15.4
```

Comprueba que todo quedó instalado:

```powershell
node -v; pnpm -v; git --version; nssm version; ffmpeg -version
```

Los servicios corren como LocalSystem y usan el `PATH` del sistema, donde Chocolatey deja estos programas. Si se transcriben spots, instala también **whisper.cpp** y pon sus rutas en `WHISPER_BIN` y `WHISPER_MODEL` del `.env`.

### 3. PostgreSQL 16

En el comando, cambia `CLAVE_POSTGRES` por una clave fuerte. Es la misma que va en `DATABASE_URL_MIGRATOR`.

```powershell
choco install postgresql16 -y --params "/Password:CLAVE_POSTGRES /Port:5433"
```

Haz que escuche solo en el propio equipo y reinicia el servicio:

```powershell
$conf = 'C:\Program Files\PostgreSQL\16\data\postgresql.conf'; (Get-Content $conf) -replace "^#?listen_addresses\s*=.*", "listen_addresses = 'localhost'" | Set-Content $conf -Encoding ascii; Restart-Service postgresql-x64-16
```

Crea la base y déjala en hora UTC, igual que en Docker. Cada comando pide la clave de `postgres`.

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\createdb.exe' -p 5433 -U postgres pautas
```

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -p 5433 -U postgres -d pautas -c "ALTER DATABASE pautas SET timezone TO 'UTC';"
```

### 4. Memurai (en lugar de Redis)

Este comando instala la edición Developer. Para producción hace falta la licencia Enterprise. Si Chocolatey no encuentra el paquete, `choco search memurai` muestra su nombre.

```powershell
choco install memurai-developer -y
```

Ponlo en el puerto 6380, solo en el propio equipo y con guardado en disco, y reinícialo:

```powershell
$conf = 'C:\Program Files\Memurai\memurai.conf'; (Get-Content $conf) -replace '^port\s+\d+', 'port 6380' -replace '^#?\s*bind\s+.*', 'bind 127.0.0.1' -replace '^appendonly\s+no', 'appendonly yes' | Set-Content $conf -Encoding ascii; Restart-Service Memurai
```

Comprueba que responde (debe decir `PONG`):

```powershell
& 'C:\Program Files\Memurai\memurai-cli.exe' -p 6380 ping
```

### 5. Almacenamiento local de archivos

Crea la carpeta donde se guardarán anuncios, comprobantes y clips de certificados:

```powershell
New-Item -ItemType Directory -Force C:\datos\pautas\archivos
```

La aplicación crea sus subcarpetas al guardar archivos. No se instala MinIO ni se necesita AWS. Conserva esta carpeta al hacer actualizaciones y respáldala en otro disco o destino seguro; si el servidor o su disco falla, los archivos sin copia de seguridad se pierden.

### 6. El repositorio y el `.env`

Entra a la carpeta donde está clonado el repositorio. En el servidor actual es `C:\Users\Administrador\Circuito_Lider`.

```powershell
cd C:\Users\Administrador\Circuito_Lider
```

```powershell
git pull
```

```powershell
copy .env.example .env
```

Edita el `.env` con `notepad .env`. Debe vivir solo en el servidor, nunca en git ni en el vault:

- **`PAUTAS_SERVICIOS=nativos`:** hace que `pnpm iniciar` no busque Docker.
- **Claves de las URLs de la base:**
  - `DATABASE_URL_MIGRATOR` lleva la clave de `postgres` del paso 3.
  - `DATABASE_URL` (rol `app_api`) y `DATABASE_URL_WORKER` (rol `app_worker`) llevan claves nuevas y fuertes. `pnpm iniciar` se las asigna a esos roles.
- **`SPOTS_DIR=C:/datos/pautas/archivos`:** ruta absoluta local. Al definirla, la aplicación usa disco en vez de las variables S3 de desarrollo.
- **`MFA_KEY`, `PAGOS_PRUEBA_SECRETO` y `AVISOS_SECRETO`:** valores nuevos. El `.env.example` dice cómo generar cada uno.
- **`FFMPEG_BIN=C:/ProgramData/chocolatey/bin/ffmpeg.exe`.**
- **`PORTAL_URL` y `API_URL_PUBLICA`:** las direcciones con que se llegará al servidor.
- **`AVISOS_EN_CONSOLA`:** quítalo cuando n8n reciba los avisos.

Después instala y compila:

```powershell
pnpm install --frozen-lockfile
```

```powershell
pnpm build
```

### 7. Servicios de Windows

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; .\infra\windows\instalar-servicios.ps1 -Nssm (Get-Command nssm).Source
```

Al terminar muestra los servicios `Pautas*` en estado `Running`. Antes de encender las apps, el script corre `pnpm iniciar --nativo --sin-apps`, que espera a Postgres y Memurai, aplica migraciones, configura roles y carga catálogo y reglas.

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
2. Detiene las apps. Postgres y Memurai siguen arriba; la carpeta local de archivos se conserva.
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
