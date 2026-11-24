<#
  Actualiza el servidor Windows a lo último de main y reinicia los servicios del Sistema de Pautas.
  Uso (PowerShell como administrador, desde la raíz del repo):  .\infra\windows\actualizar.ps1
#>
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $raiz

function Invoke-Paso([string] $Titulo, [scriptblock] $Paso) {
  Write-Host "== $Titulo"
  & $Paso
  if ($LASTEXITCODE -ne 0) { throw "Falló: $Titulo" }
}

$apps = Get-Service Pautas* -ErrorAction SilentlyContinue | Where-Object Name -ne 'PautasMinio'
Invoke-Paso 'Bajando cambios' { git pull --ff-only }
# Antes de instalar: con las apps corriendo, Windows bloquea archivos de node_modules y .next.
Write-Host '== Deteniendo apps'
$apps | Stop-Service
Invoke-Paso 'Instalando dependencias' { pnpm install --frozen-lockfile }
Invoke-Paso 'Compilando portal y panel' { pnpm build }
# Migraciones, roles, parrilla, tarifario de ejemplo (solo si no hay) y palabras prohibidas.
Invoke-Paso 'Preparando la base' { pnpm iniciar --nativo --sin-apps }
Write-Host '== Arrancando apps'
$apps | Start-Service
Get-Service Pautas* | Format-Table Name, Status -AutoSize
