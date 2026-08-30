@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows First-Time Setup (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
title AegisDB First-Time Setup

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo   Node.js runtime not found on this Windows machine.
    echo   Attempting automatic installation of Node.js LTS...
    echo ============================================================
    echo.

    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo [1/2] Installing Node.js LTS via Windows Package Manager (winget)...
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    ) else (
        echo [1/2] Downloading Node.js LTS installer from nodejs.org...
        powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\node-setup.msi'; Start-Process msiexec.exe -ArgumentList '/i %TEMP%\node-setup.msi /passive' -Wait"
    )

    set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%APPDATA%\npm;%PATH%"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js could not be installed automatically.
    echo Please download and install Node.js manually from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

node scripts\setup.js %*
if %errorlevel% neq 0 (
    pause
)
