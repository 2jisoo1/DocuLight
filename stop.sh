#!/bin/bash

# DocLight Stop Script
# Usage: ./stop.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="doclight"

echo "========================================"
echo "  DocLight Server Stop"
echo "========================================"

# Determine pm2 command (global or npx)
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
else
    PM2_CMD="npx pm2"
fi

# Check if app is running
if $PM2_CMD list 2>/dev/null | grep -q "$APP_NAME"; then
    echo "[INFO] Stopping $APP_NAME..."
    $PM2_CMD stop "$APP_NAME"
    $PM2_CMD delete "$APP_NAME"
    echo ""
    echo "[SUCCESS] $APP_NAME stopped successfully!"
else
    echo "[INFO] $APP_NAME is not running"
fi

echo "========================================"
