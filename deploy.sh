#!/bin/bash
set -euo pipefail

# ===========================================
# SEO App - VPS Update & Deploy Script
# Assumes: system deps, Node.js, Python, Playwright already installed
# ===========================================

APP_DIR="/var/www/seoapp"
FRONTEND_DIR="$APP_DIR/frontend"
APP_USER="seoapp"

echo "=== SEO App - Deploy ==="

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

# 1. Sync files
echo "[1/7] Syncing files to app directory..."
sudo mkdir -p "$APP_DIR/reports" "$APP_DIR/screenshots" "$APP_DIR/frontend/public/uploads"
sudo rsync -a --delete --exclude='node_modules' --exclude='.next' --exclude='venv' \
    --exclude='.git' --exclude='*.pyc' --exclude='__pycache__' \
    --exclude='/package-lock.json' --exclude='frontend/.env' --exclude='/.env' \
    --exclude='frontend/prisma/*.db' --exclude='frontend/prisma/*.db-journal' \
    --exclude='frontend/public/uploads' --exclude='reports' --exclude='screenshots' \
    ./ "$APP_DIR/"
sudo rm -rf "$APP_DIR/.git"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 2. Python dependencies
echo "[2/7] Installing Python dependencies..."
run_as_app "'$APP_DIR/venv/bin/pip' install -r '$APP_DIR/requirements.txt'"

# 3. Node dependencies
echo "[3/7] Installing Node.js dependencies..."
run_as_app "cd '$FRONTEND_DIR' && npm ci"

# 4. Database schema & seed
echo "[4/7] Updating database schema..."
run_as_app "cd '$FRONTEND_DIR' && npx prisma generate"
run_as_app "cd '$FRONTEND_DIR' && npx prisma db push"
run_as_app "cd '$FRONTEND_DIR' && npx tsx prisma/seed.ts"

# 5. Build frontend
echo "[5/7] Building Next.js frontend..."
run_as_app "cd '$FRONTEND_DIR' && npm run build"
ln -sf "$FRONTEND_DIR/.env" "$FRONTEND_DIR/.next/standalone/.env"

# 6. Fix permissions & restart services
echo "[6/7] Restarting services..."
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo cp "$APP_DIR/seoapp.service" /etc/systemd/system/seoapp.service 2>/dev/null || true
sudo cp "$APP_DIR/nextjs-seoapp.service" /etc/systemd/system/nextjs-seoapp.service 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl restart seoapp
sudo systemctl restart nextjs-seoapp

# 7. Health checks
echo "[7/7] Running health checks..."

if ! wait_for_http "http://127.0.0.1:8000/health" 45 2; then
    echo "ERROR: FastAPI health check failed"
    print_service_debug "seoapp"
    exit 1
fi

if ! wait_for_http "http://127.0.0.1:3000" 45 2; then
    echo "ERROR: Next.js health check failed"
    print_service_debug "nextjs-seoapp"
    exit 1
fi

# Nginx
if command -v nginx &>/dev/null; then
    sudo cp "$APP_DIR/nginx-seoapp.conf" /etc/nginx/sites-available/seoapp.conf 2>/dev/null || true
    sudo ln -sf /etc/nginx/sites-available/seoapp.conf /etc/nginx/sites-enabled/seoapp.conf
    sudo nginx -t && sudo systemctl reload nginx
fi

echo ""
echo "=== Deploy complete! ==="
