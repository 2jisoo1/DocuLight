@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: DocLight Start Script
:: Usage: start.bat

set ENTRY_POINT=src/app.js
set NAME_FILE=.pm2-app-name

:: Load or generate unique PM2 app name
if exist "%NAME_FILE%" (
    set /p APP_NAME=<"%NAME_FILE%"
) else (
    for /f %%A in ('powershell -NoProfile -Command "-join((48..57+97..122)|Get-Random -Count 8|%%{[char]$_})"') do set RAND=%%A
    set APP_NAME=doculight-!RAND!
    echo !APP_NAME!> "%NAME_FILE%"
)

echo ========================================
echo   DocuLight Server Start (!APP_NAME!)
echo ========================================

:: Change to script directory
cd /d "%~dp0"

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed
    exit /b 1
)

:: Determine pm2 command (global or npx)
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    set PM2_CMD=pm2
    echo [INFO] Using global pm2
) else (
    set PM2_CMD=npx pm2
    echo [INFO] Using npx pm2
)

:: Check and install dependencies
echo [INFO] Checking dependencies...
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
) else (
    echo [INFO] Verifying dependencies...
    call npm install --prefer-offline --no-audit
)

:: Check if config.json5 exists
if not exist "config.json5" (
    echo [WARNING] config.json5 not found!
    echo [INFO] Please copy config.example.json5 to config.json5 and configure it
    exit /b 1
)

:: Check if already running and restart or start
call %PM2_CMD% list 2>nul | findstr /C:"%APP_NAME%" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] %APP_NAME% is already running. Restarting...
    call %PM2_CMD% restart %APP_NAME%
) else (
    echo [INFO] Starting %APP_NAME%...
    call %PM2_CMD% start %ENTRY_POINT% --name %APP_NAME%
)

echo.
echo [SUCCESS] %APP_NAME% started successfully!
echo.
call %PM2_CMD% status %APP_NAME%
echo.
echo Commands:
echo   %PM2_CMD% logs %APP_NAME%    - View logs
echo   %PM2_CMD% status             - Check status
echo   stop.bat                     - Stop server
echo ========================================

endlocal
