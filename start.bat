@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows Launcher (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found on PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

node scripts\serve.js %*
if %errorlevel% neq 0 (
    pause
)
