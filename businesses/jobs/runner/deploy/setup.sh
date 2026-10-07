#!/usr/bin/env bash
# Installs the jobs runner on a fresh Ubuntu server (an Oracle Always Free VM
# works, ARM or x86). Run it ONCE as the normal user, not as root:
#
#   curl -fsSL https://raw.githubusercontent.com/aviramo/floa/main/businesses/jobs/runner/deploy/setup.sh | bash
#
# It installs Node, a virtual screen (xvfb) and Chromium, fetches the repo, and
# registers the runner as a service that starts with the machine. It does NOT
# start it: the .env file and sessions.json must be put in place first (see
# ../README.md, "להעביר לשרת").
set -euo pipefail

REPO="https://github.com/aviramo/floa.git"
DIR="$HOME/floa"

sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates xvfb

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"
cd "$DIR/businesses/jobs/runner"
git pull --ff-only
npm install --omit=dev
# Playwright's own Chromium, plus the system libraries it needs
sudo "$(command -v node)" node_modules/playwright-core/cli.js install-deps chromium
node node_modules/playwright-core/cli.js install chromium

sudo tee /etc/systemd/system/jobs-runner.service >/dev/null <<UNIT
[Unit]
Description=Jobs runner
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR/businesses/jobs/runner
Environment=RUNNER_ENV=server
ExecStart=/usr/bin/xvfb-run -a --server-args="-screen 0 1366x850x24" $(command -v node) run.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable jobs-runner

echo
echo "הותקן. עכשיו שים בשרת את שני הקבצים (.env ו-sessions.json) ואז: sudo systemctl start jobs-runner"
