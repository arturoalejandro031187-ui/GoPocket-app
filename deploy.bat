@echo off
echo ===================================================
echo   DESPLIEGE DIRECTO A VERCEL (PRODUCCION)
echo ===================================================
echo.
echo Iniciando subida desde carpeta local...

if "%~1"=="" (
  call npx vercel --prod --yes
) else (
  echo Usando token proporcionado...
  call npx vercel --prod --yes --token %1
)

echo.
echo ===================================================
echo   DESPLIEGE FINALIZADO
echo ===================================================
pause