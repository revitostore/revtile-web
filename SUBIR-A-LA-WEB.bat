@echo off
chcp 65001 >nul
title REVTILE - Subir cambios a revtile.com.co
cd /d "%~dp0"

echo.
echo  ===========================================================
echo    REVTILE - Publicar en revtile.com.co
echo  ===========================================================
echo.

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
  echo  [X] Esta carpeta no es el repositorio de REVTILE.
  echo      Este archivo tiene que estar dentro de revtile-web.
  echo.
  pause
  exit /b 1
)

echo  Rama actual:
git rev-parse --abbrev-ref HEAD
echo.

echo  Lo que se va a subir:
echo  -----------------------------------------------------------
git log --oneline origin/main..HEAD
echo  -----------------------------------------------------------
echo.

git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  echo  [!] Hay cambios sin guardar en la carpeta. NO se van a subir.
  echo      Solo se sube lo que ya esta en un commit.
  echo.
)

echo  Subiendo...
echo.
git push origin HEAD

if errorlevel 1 (
  echo.
  echo  ===========================================================
  echo    [X] NO se pudo subir.
  echo  ===========================================================
  echo.
  echo  Si pide usuario y contrasena, escribe:
  echo    git config --global credential.helper manager
  echo  y vuelve a intentar: se abre el navegador para entrar a GitHub.
  echo.
  pause
  exit /b 1
)

echo.
echo  ===========================================================
echo    [OK] Subido.
echo  ===========================================================
echo.
echo  Cloudflare esta construyendo el sitio.
echo  En 2 o 3 minutos revisa:  https://revtile.com.co
echo.
echo  Si algo salio mal, para devolver la pagina a como estaba:
echo    git reset --hard dca0648
echo    git push --force origin main
echo.
pause
