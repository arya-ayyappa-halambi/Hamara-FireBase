@echo off
setlocal EnableDelayedExpansion
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows Server Stop Utility (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
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
    "%NODE_BIN%" scripts\stop.js %*
) else (
    echo [INFO] Stopping AegisDB background services via Windows PowerShell...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000,3001,3002,4000,5000,8000,8080,9000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe') -and ($_.CommandLine -match 'server.ts' -or $_.CommandLine -match 'serve.js') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    echo [DONE] AegisDB ports released.
)

timeout /t 2 /nobreak >nul
