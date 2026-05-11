#!/bin/bash
# ─── NORMES HACCP — EC2 Bootstrap Script ────────────────────────────────────
# Run once on a fresh Ubuntu 22.04 LTS instance as root (or with sudo).
#
# Usage:
#   export GITHUB_REPO="your-github-user/haccp-normes"
#   curl -fsSL https://raw.githubusercontent.com/$GITHUB_REPO/main/deploy/ec2-setup.sh | sudo -E bash
#
# GITHUB_REPO defaults to the value below if not set in the environment.
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-your-github-user/haccp-normes}"

echo "🚀  NORMES HACCP — EC2 Setup"

# ── 1. System update ─────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git unzip jq htop

# ── 2. Docker ────────────────────────────────────────────────────────────────
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
usermod -aG docker ubuntu          # allow ubuntu user to run docker without sudo

# ── 3. Docker Compose v2 ─────────────────────────────────────────────────────
COMPOSE_VERSION="v2.27.0"
curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ── 4. Node / pnpm (for migrations & scripts) ────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm

# ── 5. Clone project ─────────────────────────────────────────────────────────
APP_DIR="/opt/haccp"
if [ ! -d "$APP_DIR" ]; then
  git clone "https://github.com/${GITHUB_REPO}.git" "$APP_DIR"
else
  cd "$APP_DIR" && git pull
fi
chown -R ubuntu:ubuntu "$APP_DIR"

# ── 6. Systemd service for auto-restart on reboot ────────────────────────────
cat > /etc/systemd/system/haccp.service <<'EOF'
[Unit]
Description=NORMES HACCP Docker Compose Stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/haccp
ExecStart=/usr/local/bin/docker-compose up -d --build
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable haccp

echo ""
echo "✅  EC2 setup complete."
echo ""
echo "Next steps:"
echo "  1. Upload your .env file:  scp .env ubuntu@<EC2_IP>:/opt/haccp/.env"
echo "  2. Start the stack:        sudo systemctl start haccp"
echo "  3. Check logs:             docker-compose -f /opt/haccp/docker-compose.yml logs -f"
