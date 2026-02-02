@echo off
chcp 65001 > nul
setlocal

:: DocLight Stop Script
:: Usage: stop.bat

set NAME_FILE=.pm2-app-name

:: Load PM2 app name
if exist "%NAME_FILE%" (
    set /p APP_NAME=<"%NAME_FILE%"
) else (
    echo [ERROR] No instance name found. Was start.bat ever run?
    exit /b 1
)

echo ========================================
echo   DocuLight Server Stop (!APP_NAME!)
echo ========================================

:: Change to script directory
cd /d "%~dp0"

:: Determine pm2 command (global or npx)
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    set PM2_CMD=pm2
) else (
    set PM2_CMD=npx pm2
)

:: Check if app is running
call %PM2_CMD% list 2>nul | findstr /C:"%APP_NAME%" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Stopping %APP_NAME%...
    call %PM2_CMD% stop %APP_NAME%
    call %PM2_CMD% delete %APP_NAME%
    echo.
    echo [SUCCESS] %APP_NAME% stopped successfully!
) else (
    echo [INFO] %APP_NAME% is not running
)

echo ========================================

endlocal
