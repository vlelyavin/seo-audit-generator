#!/bin/bash
set -e

# ===========================================
# SEO Audit Tool - VPS Deployment Script
# Tested on Ubuntu 22.04 / Debian 12
# ===========================================

APP_DIR="/var/www/seo-audit"
APP_USER="seo-audit"
PYTHON_VERSION="python3"

echo "=== SEO Audit Tool - Deployment ==="

# 1. System dependencies
echo "[1/7] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    python3 python3-venv python3-pip \
    libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev shared-mime-info

# 2. Create app user (no login shell)
echo "[2/7] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
fi

# 3. Setup app directory
echo "[3/7] Setting up app directory..."
sudo mkdir -p "$APP_DIR"
sudo cp -r ./* "$APP_DIR/" 2>/dev/null || true
sudo cp .env.example "$APP_DIR/.env" 2>/dev/null || true
sudo mkdir -p "$APP_DIR/reports" "$APP_DIR/screenshots"

# 4. Python venv & dependencies
echo "[4/7] Installing Python dependencies..."
cd "$APP_DIR"
sudo $PYTHON_VERSION -m venv venv
sudo "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo "$APP_DIR/venv/bin/pip" install -r requirements.txt

# 5. Playwright (Chromium)
echo "[5/7] Installing Playwright Chromium..."
sudo "$APP_DIR/venv/bin/playwright" install chromium
sudo "$APP_DIR/venv/bin/playwright" install-deps chromium

# 6. Fix permissions
echo "[6/7] Fixing permissions..."
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 7. Systemd service
echo "[7/7] Setting up systemd service..."
sudo cp "$APP_DIR/seo-audit.service" /etc/systemd/system/seo-audit.service 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable seo-audit
sudo systemctl start seo-audit

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "App is running at: http://${SERVER_IP}:8000"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status seo-audit    - check status"
echo "  sudo systemctl restart seo-audit   - restart"
echo "  sudo journalctl -u seo-audit -f    - view logs"
