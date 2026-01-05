#!/bin/bash

# DocLight Start Script
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="doclight"
ENTRY_POINT="src/app.js"

echo "========================================"
echo "  DocLight Server Start"
echo "========================================"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed"
    exit 1
fi

# Determine pm2 command (global or npx)
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
    echo "[INFO] Using global pm2"
else
    PM2_CMD="npx pm2"
    echo "[INFO] Using npx pm2"
fi

# Check and install dependencies
echo "[INFO] Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing dependencies..."
    npm install
else
    # Check if package-lock.json is newer than node_modules
    if [ "package.json" -nt "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
        echo "[INFO] package.json changed. Updating dependencies..."
        npm install
    else
        echo "[INFO] Dependencies are up to date"
    fi
fi

# Check if config.json5 exists
if [ ! -f "config.json5" ]; then
    echo "[WARNING] config.json5 not found!"
    echo "[INFO] Please copy config.example.json5 to config.json5 and configure it"
    exit 1
fi

# Check if already running
if $PM2_CMD list 2>/dev/null | grep -q "$APP_NAME"; then
    echo "[INFO] $APP_NAME is already running. Restarting..."
    $PM2_CMD restart "$APP_NAME"
else
    echo "[INFO] Starting $APP_NAME..."
    $PM2_CMD start "$ENTRY_POINT" --name "$APP_NAME"
fi

echo ""
echo "[SUCCESS] $APP_NAME started successfully!"
echo ""
$PM2_CMD status "$APP_NAME"
echo ""
echo "Commands:"
echo "  $PM2_CMD logs $APP_NAME    - View logs"
echo "  $PM2_CMD status            - Check status"
echo "  ./stop.sh                  - Stop server"
echo "========================================"
