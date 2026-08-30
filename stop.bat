@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  AegisDB 1-Click Windows Server Stop Utility (Double-Clickable in File Explorer)
REM ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found on PATH.
    pause
    exit /b 1
)

node scripts\stop.js %*
timeout /t 3 /nobreak >nul
