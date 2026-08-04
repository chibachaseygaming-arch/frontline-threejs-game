@echo off
cd /d "%~dp0"
title FRONTLINE Launcher

if exist "electron-server.pid" (
  for /f "usebackq delims=" %%P in ("electron-server.pid") do taskkill /pid %%P /t /f >nul 2>nul
  del /q "electron-server.pid" >nul 2>nul
)

rem Close only Electron processes launched from this FRONTLINE project.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$frontlineElectron=[IO.Path]::GetFullPath('%~dp0node_modules\electron\dist\electron.exe'); Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $frontlineElectron } | Stop-Process -Force"
timeout /t 1 /nobreak >nul

if exist "node_modules\electron\dist\electron.exe" (
  start "FRONTLINE" "node_modules\electron\dist\electron.exe" "."
  exit /b 0
)

echo Electron is not installed yet.
echo Open a terminal in this folder and run: pnpm install
pause
