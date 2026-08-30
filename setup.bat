@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Universal Setup (Double-Clickable in Windows File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
title AegisDB First-Time Universal Setup

echo.
echo ============================================================================
echo         [AegisDB] First-Time Universal Device Setup ^& Dependency Installer
echo ============================================================================
echo.

REM Refresh PATH from common installation directories and Windows Registry
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

REM Probe for node executable
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE (
    where node >nul 2>nul
    if %errorlevel% equ 0 set "NODE_EXE=node"
)

if not defined NODE_EXE (
    echo [1/3] Node.js runtime not found on this Windows machine.
    echo       Downloading official Node.js LTS installer from nodejs.org...
    echo.

    set "MSI_FILE=%TEMP%\node-v20-x64.msi"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host '  ➜ Downloading Node.js LTS 64-bit installer...'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%MSI_FILE%'"
    
    if not exist "%MSI_FILE%" (
        echo.
        echo [ERROR] Failed to download Node.js installer.
        echo Please download and install Node.js manually from: https://nodejs.org
        echo.
        pause
        exit /b 1
    )

    echo.
    echo ============================================================================
    echo   [ACTION REQUIRED]
    echo   The Node.js Setup Wizard is now opening on your screen.
    echo   Please click: Next -^> Accept -^> Next -^> Install -^> Finish
    echo ============================================================================
    echo.

    msiexec.exe /i "%MSI_FILE%"
    
    REM Refresh PATH from Windows Registry after installation
    for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
    set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%SYS_PATH%;%USR_PATH%;%PATH%"

    if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
    if not defined NODE_EXE (
        where node >nul 2>nul
        if %errorlevel% equ 0 set "NODE_EXE=node"
    )
)

if not defined NODE_EXE (
    echo.
    echo [ERROR] Node.js is required to run AegisDB.
    echo Please complete Node.js installation from https://nodejs.org and re-run setup.bat.
    echo.
    pause
    exit /b 1
)

echo [2/3] Node.js runtime confirmed:
"%NODE_EXE%" -v
echo.

echo [3/3] Launching AegisDB automated dependency installer ^& bootstrapper...
echo.

"%NODE_EXE%" scripts\setup.js %*
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Setup encountered an issue or was terminated.
    pause
)
