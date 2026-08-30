@echo off
setlocal EnableDelayedExpansion
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Fast Setup (Double-Clickable in Windows File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
title AegisDB 1-Click Fast Universal Setup

echo.
echo ============================================================================
echo         [AegisDB] 1-Click Fast Universal Device Setup ^& Auto-Installer
echo ============================================================================
echo.

:CHECK_NODE
REM Refresh PATH with common Node.js install locations
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    goto NODE_FOUND
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
    goto NODE_FOUND
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    goto NODE_FOUND
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto NODE_FOUND
)

REM If we reach here, Node.js is NOT installed!
echo ----------------------------------------------------------------------------
echo  [1/3] Node.js runtime not found.
echo        Auto-downloading ^& installing official Node.js 20 LTS (please wait)...
echo ----------------------------------------------------------------------------
echo.

set "MSI_FILE=%TEMP%\node-v20-x64.msi"

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host '  ➜ Fetching official Node.js LTS 64-bit package...'; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', $env:MSI_FILE)"

if not exist "%MSI_FILE%" (
    echo.
    echo [ERROR] Failed to download Node.js installer automatically.
    echo Please download and install Node.js manually from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo   ➜ Performing silent background installation (approx. 5 seconds)...
msiexec.exe /i "%MSI_FILE%" /qn /norestart

REM Refresh Registry PATH
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;!SYS_PATH!;!USR_PATH!;!PATH!"

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    goto NODE_FOUND
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
    goto NODE_FOUND
)
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto NODE_FOUND
)

REM If silent install required elevated UAC, launch wizard interactively
echo.
echo   ➜ Finalizing installer with standard Setup Wizard...
start /wait msiexec.exe /i "%MSI_FILE%"

for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;!SYS_PATH!;!USR_PATH!;!PATH!"

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    goto NODE_FOUND
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
    goto NODE_FOUND
)
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_BIN=node"
    goto NODE_FOUND
)

echo.
echo [ERROR] Node.js installation was not completed.
echo Please download and install Node.js from https://nodejs.org and re-run setup.bat.
echo.
pause
exit /b 1

:NODE_FOUND
echo ----------------------------------------------------------------------------
echo  [2/3] Node.js runtime confirmed:
"%NODE_BIN%" -v
echo ----------------------------------------------------------------------------
echo.

echo ----------------------------------------------------------------------------
echo  [3/3] Fast-installing dependencies and booting AegisDB...
echo ----------------------------------------------------------------------------
echo.

"%NODE_BIN%" scripts\setup.js %*
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Setup finished with code %errorlevel%.
    pause
)
