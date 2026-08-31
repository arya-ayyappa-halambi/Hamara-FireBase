@echo off
setlocal EnableDelayedExpansion
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows Server Stop Utility (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

title AegisDB Stop Server

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

set "NODE_BIN="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_BIN (
    where node >nul 2>nul
    if !errorlevel! equ 0 set "NODE_BIN=node"
)

if defined NODE_BIN (
    "%NODE_BIN%" "%~dp0scripts\stop.js" %* <nul
)

REM ── Extra Windows Safety Cleanup: Release all lingering locks, ports & child processes ──
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000,3001,3002,4000,5000,8000,8080,9000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$projPath = '%~dp0'.TrimEnd('\'); Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -like \"*$projPath*\") -or ($_.CommandLine -like \"*$projPath*\") -or ($_.Name -eq 'node.exe' -and ($_.CommandLine -match 'server.ts' -or $_.CommandLine -match 'serve.js' -or $_.CommandLine -match 'nodemon' -or $_.CommandLine -match 'ts-node')) } | ForEach-Object { if ($_.ProcessId -ne $PID) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }" >nul 2>nul

REM ── Close any open AegisDB Launcher / Setup terminal windows ──
taskkill /F /FI "WINDOWTITLE eq AegisDB*" >nul 2>nul

REM ── Navigate out of project folder into TEMP to completely release Windows directory lock ──
cd /d "%TEMP%"
exit /b 0
