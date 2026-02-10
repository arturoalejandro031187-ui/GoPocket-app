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

function Install-VercelCLI {
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

Install-VercelCLI

# 1. Leer variables ANTES de que 'vercel link' sobrescriba el archivo
function Import-EnvFromFile {
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
      $val = $parts[1].Trim()
      # Remove surrounding quotes if present
      if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
          $val = $val.Substring(1, $val.Length - 2)
      }
      $map[$key] = $val
    }
  }
  return $map
}

Write-Host "Cargando variables locales desde $EnvFromFile..." -ForegroundColor Yellow
$envMap = Import-EnvFromFile -Path $EnvFromFile

# Logic to determine authentication method
$TokenArgs = @()
if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $TokenArgs = @("--token", $Token)
} else {
    Write-Host "Verificando sesión local de Vercel..." -ForegroundColor Yellow
    # Check if logged in
    Write-Host "Usuario actual: $env:USERNAME"
    vercel whoami 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Sesión activa detectada." -ForegroundColor Green
    } else {
        Write-Warning "No se detectó sesión activa."
        $Token = Read-Host "Pega tu Vercel Access Token (o presiona Enter para cancelar)"
        if ([string]::IsNullOrWhiteSpace($Token)) {
            Write-Error "Se requiere iniciar sesión ('vercel login') o un Access Token."
            exit 1
        }
        $TokenArgs = @("--token", $Token)
    }
}

Write-Host "Vinculando proyecto con Vercel..." -ForegroundColor Yellow
# Use Invoke-Expression or direct command with array arguments
# Using array args with call operator & is safer
& vercel link --yes @TokenArgs | Out-Null

Write-Host "Creando despliegue (preview) para inicializar proyecto..." -ForegroundColor Yellow
& vercel --yes --name $ProjectName @TokenArgs | Out-Null

Write-Host "Configurando variables de entorno (Production)..." -ForegroundColor Yellow

# (La función Import-EnvFromFile se movió al inicio)

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
  # Create temp file to pipe to vercel env add
  # Note: vercel env add expects value from stdin or interactive. 
  # Piping in PowerShell can be tricky with encoding.
  # We use a temp file and Get-Content to pipe cleanly.
  
  $temp = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($temp, $Value)
  
  # Check if env exists first to avoid error? Or just force add?
  # 'vercel env add' prompts for targets. 
  # We use 'vercel env add NAME production' syntax if supported, or pipe answers.
  # Standard syntax: echo value | vercel env add NAME production
  
  # We will try to add to production. 
  # If it exists, it might fail or ask to overwrite. 
  # We'll use --force if available, or just ignore errors.
  
  # Using cmd /c for piping might be more reliable for stdin
  cmd /c "type $temp | vercel env add $Name production --force" @TokenArgs | Out-Null
  
  Remove-Item $temp -Force
}

# Only push envs if we actually have values
if (-not [string]::IsNullOrWhiteSpace($NEXT_PUBLIC_SUPABASE_URL)) {
    Push-Env -Name "NEXT_PUBLIC_SUPABASE_URL" -Value $NEXT_PUBLIC_SUPABASE_URL
}
if (-not [string]::IsNullOrWhiteSpace($NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    Push-Env -Name "NEXT_PUBLIC_SUPABASE_ANON_KEY" -Value $NEXT_PUBLIC_SUPABASE_ANON_KEY
}
if (-not [string]::IsNullOrWhiteSpace($SUPABASE_URL)) {
    Push-Env -Name "SUPABASE_URL" -Value $SUPABASE_URL
}
if (-not [string]::IsNullOrWhiteSpace($SUPABASE_SERVICE_ROLE_KEY)) {
    Push-Env -Name "SUPABASE_SERVICE_ROLE_KEY" -Value $SUPABASE_SERVICE_ROLE_KEY
}

# Add Replicate Token
$REPLICATE_API_TOKEN = $envMap["REPLICATE_API_TOKEN"]
if (-not [string]::IsNullOrWhiteSpace($REPLICATE_API_TOKEN)) {
    Push-Env -Name "REPLICATE_API_TOKEN" -Value $REPLICATE_API_TOKEN
}


Write-Host "Desplegando a producción..." -ForegroundColor Yellow
# --prod triggers a production deployment
# --prebuilt uses existing build output? No, usually we want Vercel to build.
# Removing --prebuilt unless we are sure we built locally correctly for Vercel.
# Usually 'vercel --prod' builds on the cloud.
& vercel --prod --yes @TokenArgs

Write-Host "=== Despliegue finalizado ===" -ForegroundColor Green
