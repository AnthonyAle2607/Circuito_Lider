<#
  Registra el Sistema de Pautas como servicios de Windows (Windows Server 2019, sin Docker), con NSSM.
  Guía completa y requisitos previos: docs/servidor-windows.md.

  Crea (o recrea, si ya existen) estos servicios, que arrancan solos con Windows:
    PautasMinio     almacén S3 (minio.exe) en 127.0.0.1:9100, consola en 127.0.0.1:9101
    PautasApi       API (puerto 4100)
    PautasWorkers   trabajos en segundo plano
    PautasPortal    portal de clientes (puerto 3100)
    PautasPanel     panel del equipo (puerto 3110)
    PautasGrabador  grabación de emisoras (solo con -ConGrabador)

  Antes de arrancar las apps prepara la base (pnpm iniciar --nativo --sin-apps).
  Postgres y Memurai (Redis) no se registran aquí: sus instaladores crean su propio servicio.
  Las claves salen del .env del servidor; este script no guarda ninguna.

  Uso (PowerShell como administrador, desde la raíz del repo):
    .\infra\windows\instalar-servicios.ps1 -Nssm C:\herramientas\nssm\nssm.exe -Minio C:\herramientas\minio\minio.exe
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Nssm,
  [Parameter(Mandatory)] [string] $Minio,
  [string] $Raiz = (Resolve-Path "$PSScriptRoot\..\..").Path,
  [string] $DatosMinio = 'C:\datos\minio',
  [string] $ServicioPostgres = 'postgresql-x64-16',
  [string] $ServicioRedis = 'Memurai',
  [switch] $ConGrabador
)
$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abre PowerShell como administrador.' }
foreach ($f in @($Nssm, $Minio, "$Raiz\.env")) { if (-not (Test-Path $f)) { throw "No existe: $f" } }
foreach ($s in @($ServicioPostgres, $ServicioRedis)) {
  if (-not (Get-Service -Name $s -ErrorAction SilentlyContinue)) { throw "No encuentro el servicio $s. Instala Postgres y Memurai primero (docs/servidor-windows.md)." }
}
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { throw 'pnpm no está en el PATH del sistema (corepack enable).' }

# Lee el .env (KEY=valor, sin comentarios).
$envVars = @{}
foreach ($linea in Get-Content "$Raiz\.env") {
  if ($linea -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $envVars[$Matches[1]] = $Matches[2].Trim() }
}
foreach ($k in 'S3_ACCESS_KEY', 'S3_SECRET_KEY') { if (-not $envVars[$k]) { throw "Falta $k en .env" } }
if ($envVars['S3_SECRET_KEY'] -eq 'minio-dev-only') { throw 'S3_SECRET_KEY sigue con el valor de desarrollo: pon una clave real en .env.' }

$registros = Join-Path $Raiz 'registros'
New-Item -ItemType Directory -Force $registros, $DatosMinio | Out-Null

function Install-Servicio {
  param([string] $Nombre, [string] $Programa, [string] $Argumentos, [string] $Carpeta, [string] $Descripcion, [string[]] $Depende, [string[]] $Entorno = @())
  if (Get-Service -Name $Nombre -ErrorAction SilentlyContinue) {
    & $Nssm stop $Nombre | Out-Null
    & $Nssm remove $Nombre confirm | Out-Null
  }
  & $Nssm install $Nombre $Programa | Out-Null
  & $Nssm set $Nombre AppParameters $Argumentos | Out-Null
  & $Nssm set $Nombre AppDirectory $Carpeta | Out-Null
  & $Nssm set $Nombre Description $Descripcion | Out-Null
  & $Nssm set $Nombre Start SERVICE_AUTO_START | Out-Null
  if ($Depende.Count) { & $Nssm set $Nombre DependOnService @Depende | Out-Null }
  & $Nssm set $Nombre AppStdout (Join-Path $registros "$Nombre.log") | Out-Null
  & $Nssm set $Nombre AppStderr (Join-Path $registros "$Nombre.log") | Out-Null
  & $Nssm set $Nombre AppRotateFiles 1 | Out-Null
  & $Nssm set $Nombre AppRotateOnline 1 | Out-Null
  & $Nssm set $Nombre AppRotateBytes 10485760 | Out-Null
  # Si se cae, vuelve a arrancar a los 5 s.
  & $Nssm set $Nombre AppExit Default Restart | Out-Null
  & $Nssm set $Nombre AppRestartDelay 5000 | Out-Null
  if ($Entorno.Count) { & $Nssm set $Nombre AppEnvironmentExtra @Entorno | Out-Null }
  Write-Host "  $Nombre registrado"
}

Write-Host 'Registrando servicios…'
Install-Servicio -Nombre PautasMinio -Programa $Minio `
  -Argumentos "server `"$DatosMinio`" --address 127.0.0.1:9100 --console-address 127.0.0.1:9101" `
  -Carpeta (Split-Path $Minio) -Descripcion 'Sistema de Pautas: almacén S3 (spots, comprobantes, certificados)' `
  -Depende @() -Entorno @("MINIO_ROOT_USER=$($envVars['S3_ACCESS_KEY'])", "MINIO_ROOT_PASSWORD=$($envVars['S3_SECRET_KEY'])")

$base = @($ServicioPostgres, $ServicioRedis, 'PautasMinio')
$apps = @(
  @{ Nombre = 'PautasApi'; Carpeta = 'apps\api'; Script = 'start'; Desc = 'Sistema de Pautas: API' },
  @{ Nombre = 'PautasWorkers'; Carpeta = 'apps\workers'; Script = 'start'; Desc = 'Sistema de Pautas: trabajos en segundo plano' },
  @{ Nombre = 'PautasPortal'; Carpeta = 'apps\portal'; Script = 'start'; Desc = 'Sistema de Pautas: portal de clientes' },
  @{ Nombre = 'PautasPanel'; Carpeta = 'apps\panel'; Script = 'start'; Desc = 'Sistema de Pautas: panel del equipo' }
)
if ($ConGrabador) { $apps += @{ Nombre = 'PautasGrabador'; Carpeta = 'apps\grabador'; Script = 'grabar'; Desc = 'Sistema de Pautas: grabación de emisoras' } }

foreach ($a in $apps) {
  Install-Servicio -Nombre $a.Nombre -Programa $env:ComSpec -Argumentos "/c pnpm $($a.Script)" `
    -Carpeta (Join-Path $Raiz $a.Carpeta) -Descripcion $a.Desc -Depende $base
}

Write-Host 'Arrancando MinIO y preparando la base (migraciones, roles, parrilla)…'
Start-Service PautasMinio
Push-Location $Raiz
try {
  pnpm iniciar --nativo --sin-apps
  if ($LASTEXITCODE -ne 0) { throw 'Falló pnpm iniciar --nativo --sin-apps: las apps no se arrancaron.' }
} finally { Pop-Location }
Write-Host 'Arrancando apps…'
foreach ($a in $apps) { Start-Service $a.Nombre }
Get-Service Pautas* | Format-Table Name, Status -AutoSize
Write-Host "Registros en $registros"
