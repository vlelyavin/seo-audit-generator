#!/bin/bash
set -euo pipefail

# ===========================================
# SEO Audit Tool - VPS Deployment Script
# Tested on Ubuntu 22.04 / Debian 12
# Deploys: FastAPI backend + Next.js frontend
# ===========================================

APP_DIR="/var/www/seo-audit"
FRONTEND_DIR="$APP_DIR/frontend"
APP_USER="seo-audit"
PYTHON_VERSION="python3.11"
NODE_MAJOR=20
PLAYWRIGHT_CACHE_DIR="$APP_DIR/.cache/ms-playwright"

echo "=== SEO Audit Tool - Deployment ==="

run_as_app() {
    sudo -u "$APP_USER" -H bash -c "$1"
}

wait_for_http() {
    local url="$1"
    local max_attempts="${2:-30}"
    local delay_seconds="${3:-2}"
    local attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        if curl -fsS "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep "$delay_seconds"
        attempt=$((attempt + 1))
    done

    return 1
}

print_service_debug() {
    local service_name="$1"
    echo "---- ${service_name} status ----"
    sudo systemctl status "$service_name" --no-pager || true
    echo "---- ${service_name} recent logs ----"
    sudo journalctl -u "$service_name" -n 100 --no-pager || true
}

# 1. System dependencies
echo "[1/11] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    python3.11 python3.11-venv python3.11-dev \
    libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev shared-mime-info \
    ca-certificates curl gnupg

# 2. Install Node.js (if not present or wrong major version)
echo "[2/11] Installing Node.js $NODE_MAJOR..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$NODE_MAJOR" ]]; then
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
    sudo apt-get update
    sudo apt-get install -y nodejs
    echo "Node.js $(node -v) installed"
else
    echo "Node.js $(node -v) already installed, skipping"
fi

# 3. Create app user (no login shell)
echo "[3/11] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
fi

# 4. Setup app directory
echo "[4/11] Syncing files to app directory..."
sudo mkdir -p "$APP_DIR" "$APP_DIR/reports" "$APP_DIR/screenshots"
# Use rsync for reliable copy (preserves structure, handles all files)
sudo rsync -a --exclude='node_modules' --exclude='.next' --exclude='venv' \
    --exclude='.git' --exclude='*.pyc' --exclude='__pycache__' \
    --exclude='/package-lock.json' \
    ./ "$APP_DIR/"
# Remove .git if it exists (Turbopack uses it to detect workspace root,
# which breaks @/ path aliases when .git is in the parent of frontend/)
sudo rm -rf "$APP_DIR/.git"
# Copy .env only if it doesn't exist yet (don't overwrite production config)
if [ ! -f "$APP_DIR/frontend/.env" ]; then
    sudo cp "$APP_DIR/frontend/.env.example" "$APP_DIR/frontend/.env" 2>/dev/null || true
fi
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 5. Python venv & dependencies
echo "[5/11] Installing Python dependencies..."
cd "$APP_DIR"
if [ ! -d "$APP_DIR/venv" ]; then
    run_as_app "$PYTHON_VERSION -m venv '$APP_DIR/venv'"
fi
run_as_app "'$APP_DIR/venv/bin/pip' install --upgrade pip"
run_as_app "'$APP_DIR/venv/bin/pip' install -r '$APP_DIR/requirements.txt'"

# 6. Playwright (Chromium)
echo "[6/11] Installing Playwright Chromium..."
if ! find "$PLAYWRIGHT_CACHE_DIR" -maxdepth 1 -type d -name "chromium-*" 2>/dev/null | grep -q .; then
    run_as_app "'$APP_DIR/venv/bin/playwright' install chromium"
else
    echo "Playwright Chromium already installed, skipping browser download"
fi
sudo "$APP_DIR/venv/bin/playwright" install-deps chromium

# 7. Next.js frontend - install ALL dependencies (dev deps needed for build)
echo "[7/11] Installing Next.js frontend dependencies..."
cd "$FRONTEND_DIR"
run_as_app "cd '$FRONTEND_DIR' && npm ci"

# 8. Prisma migrate (database schema)
echo "[8/11] Running Prisma migrations..."
run_as_app "cd '$FRONTEND_DIR' && npx prisma generate"
run_as_app "cd '$FRONTEND_DIR' && npx prisma migrate deploy"

# 9. Next.js frontend - production build
echo "[9/11] Building Next.js frontend..."
run_as_app "cd '$FRONTEND_DIR' && npm run build"

# 10. Fix permissions
echo "[10/11] Fixing permissions..."
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 11. Systemd services
echo "[11/11] Setting up systemd services..."
# FastAPI backend service
sudo cp "$APP_DIR/seo-audit.service" /etc/systemd/system/seo-audit.service 2>/dev/null || true
# Next.js frontend service
sudo cp "$APP_DIR/nextjs-seo-audit.service" /etc/systemd/system/nextjs-seo-audit.service 2>/dev/null || true

sudo systemctl daemon-reload

sudo systemctl enable seo-audit
sudo systemctl restart seo-audit

sudo systemctl enable nextjs-seo-audit
sudo systemctl restart nextjs-seo-audit

echo "Running health checks..."

if ! sudo systemctl is-active --quiet seo-audit; then
    echo "ERROR: FastAPI service is not active after restart"
    print_service_debug "seo-audit"
    exit 1
fi

if ! wait_for_http "http://127.0.0.1:8000/health" 45 2; then
    echo "ERROR: FastAPI health check failed"
    print_service_debug "seo-audit"
    exit 1
fi

if ! sudo systemctl is-active --quiet nextjs-seo-audit; then
    echo "ERROR: Next.js service is not active after restart"
    print_service_debug "nextjs-seo-audit"
    exit 1
fi

if ! wait_for_http "http://127.0.0.1:3000" 45 2; then
    echo "ERROR: Next.js health check failed"
    print_service_debug "nextjs-seo-audit"
    exit 1
fi

# Nginx configuration
if command -v nginx &>/dev/null; then
    sudo cp "$APP_DIR/nginx-seo-audit.conf" /etc/nginx/sites-available/seo-audit.conf 2>/dev/null || true
    sudo ln -sf /etc/nginx/sites-available/seo-audit.conf /etc/nginx/sites-enabled/seo-audit.conf
    sudo nginx -t && sudo systemctl reload nginx
    echo "Nginx configured and reloaded"
else
    echo "WARNING: nginx not found. Install nginx and copy nginx-seo-audit.conf manually."
fi

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "FastAPI backend running at: http://${SERVER_IP}:8000"
echo "Next.js frontend running at: http://${SERVER_IP}:3000"
echo "Nginx reverse proxy at:      http://${SERVER_IP}"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status seo-audit          - backend status"
echo "  sudo systemctl status nextjs-seo-audit   - frontend status"
echo "  sudo systemctl restart seo-audit         - restart backend"
echo "  sudo systemctl restart nextjs-seo-audit  - restart frontend"
echo "  sudo journalctl -u seo-audit -f          - backend logs"
echo "  sudo journalctl -u nextjs-seo-audit -f   - frontend logs"
