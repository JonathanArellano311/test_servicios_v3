@echo off
setlocal

cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

if not exist "%NPM_CMD%" (
  echo No se encontro npm en %NPM_CMD%.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"

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
