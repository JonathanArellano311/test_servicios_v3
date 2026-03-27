@echo off
setlocal

cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "GIT_CMD=git"

if not exist "%NPM_CMD%" (
  echo No se encontro npm en %NPM_CMD%.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"

where %GIT_CMD% >nul 2>nul
if errorlevel 1 (
  echo No se encontro Git en el PATH.
  pause
  exit /b 1
)

for /f %%i in ('git status --porcelain') do (
  echo Hay cambios locales sin guardar o sin subir a GitHub.
  echo Haz commit o stash antes de actualizar este proyecto desde otra PC.
  pause
  exit /b 1
)

echo Actualizando proyecto desde GitHub...
call %GIT_CMD% pull --ff-only origin main
if errorlevel 1 (
  echo No se pudo actualizar el proyecto desde GitHub.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando Test_Servicios...
start "" http://localhost:3000
call "%NPM_CMD%" start
