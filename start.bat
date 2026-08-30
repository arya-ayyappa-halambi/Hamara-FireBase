@echo off
setlocal EnableDelayedExpansion
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows Launcher (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
title AegisDB Server Launcher

REM Refresh PATH from common installation directories and Windows Registry
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

set "NODE_BIN="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_BIN (
    where node >nul 2>nul
    if !errorlevel! equ 0 set "NODE_BIN=node"
)

if not defined NODE_BIN (
    echo.
    echo ============================================================================
    echo   [ERROR] Node.js is not installed on this machine.
    echo   ➜ For 1-Click Automated Setup ^& Installation, run: setup.bat
    echo   ➜ Or download Node.js manually from: https://nodejs.org
    echo ============================================================================
    echo.
    pause
    exit /b 1
)

"%NODE_BIN%" scripts\serve.js %*
if !errorlevel! neq 0 (
    pause
)
