param(
  [string]$Token = "",
  [string]$ProjectName = "pocket-app",
  [string]$EnvFromFile = ".env.local",
  [string]$NEXT_PUBLIC_SUPABASE_URL = "",
  [string]$NEXT_PUBLIC_SUPABASE_ANON_KEY = "",
  [string]$SUPABASE_URL = "",
  [string]$SUPABASE_SERVICE_ROLE_KEY = ""
)

Write-Host "=== Despliegue directo a Vercel (sin GitHub) ===" -ForegroundColor Cyan

if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
  Write-Error "npm no está disponible en esta terminal."
  exit 1
}

try {
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force | Out-Null
} catch {
  Write-Warning "No se pudo ajustar ExecutionPolicy. Continuando..."
}

function Ensure-VercelCLI {
  if (Get-Command "vercel" -ErrorAction SilentlyContinue) {
    return
  }
  Write-Host "Instalando Vercel CLI global..." -ForegroundColor Yellow
  npm i -g vercel | Out-Null
  if (-not (Get-Command "vercel" -ErrorAction SilentlyContinue)) {
    Write-Error "No se pudo instalar/verificar Vercel CLI."
    exit 1
  }
}

Ensure-VercelCLI

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = Read-Host "Pega tu Vercel Access Token"
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  Write-Error "Se requiere un Access Token de Vercel."
  exit 1
}

Write-Host "Vinculando proyecto con Vercel..." -ForegroundColor Yellow
vercel link --yes --token $Token | Out-Null

Write-Host "Creando despliegue (preview) para inicializar proyecto..." -ForegroundColor Yellow
vercel --yes --name $ProjectName --token $Token | Out-Null

Write-Host "Configurando variables de entorno (Production)..." -ForegroundColor Yellow

# Intentar cargar valores desde archivo si no se pasaron por parámetro
function Load-EnvFromFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @{} }
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.StartsWith("#")) { return }
    $parts = $line.Split("=",2)
    if ($parts.Count -ge 2) {
      $key = $parts[0].Trim()
      $val = $parts[1]
      $map[$key] = $val
    }
  }
  return $map
}

$envMap = Load-EnvFromFile -Path $EnvFromFile

if ([string]::IsNullOrWhiteSpace($NEXT_PUBLIC_SUPABASE_URL)) {
  $NEXT_PUBLIC_SUPABASE_URL = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
}
if ([string]::IsNullOrWhiteSpace($NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
  $NEXT_PUBLIC_SUPABASE_ANON_KEY = $envMap["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
}
if ([string]::IsNullOrWhiteSpace($SUPABASE_URL)) {
  # Por defecto usar el mismo valor público si no está definido
  $SUPABASE_URL = $envMap["SUPABASE_URL"]
  if ([string]::IsNullOrWhiteSpace($SUPABASE_URL)) {
    $SUPABASE_URL = $NEXT_PUBLIC_SUPABASE_URL
  }
}
if ([string]::IsNullOrWhiteSpace($SUPABASE_SERVICE_ROLE_KEY)) {
  $SUPABASE_SERVICE_ROLE_KEY = $envMap["SUPABASE_SERVICE_ROLE_KEY"]
}

function Push-Env {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Warning "Saltando $Name (vacío)"
    return
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $temp = Join-Path $env:TEMP ("vercel_env_" + $Name + ".txt")
  [System.IO.File]::WriteAllBytes($temp, $bytes)
  Get-Content $temp | vercel env add $Name production --token $Token | Out-Null
  Remove-Item $temp -Force
}

Push-Env -Name "NEXT_PUBLIC_SUPABASE_URL" -Value $NEXT_PUBLIC_SUPABASE_URL
Push-Env -Name "NEXT_PUBLIC_SUPABASE_ANON_KEY" -Value $NEXT_PUBLIC_SUPABASE_ANON_KEY
Push-Env -Name "SUPABASE_URL" -Value $SUPABASE_URL
Push-Env -Name "SUPABASE_SERVICE_ROLE_KEY" -Value $SUPABASE_SERVICE_ROLE_KEY

Write-Host "Desplegando a producción..." -ForegroundColor Yellow
vercel --prod --prebuilt --yes --token $Token

Write-Host "=== Despliegue finalizado ===" -ForegroundColor Green
