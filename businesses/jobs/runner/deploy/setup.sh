#!/usr/bin/env bash
# Installs the jobs runner on a fresh server. Works on Ubuntu/Debian (apt) and on
# Oracle Linux / RHEL-family (dnf), ARM or x86. Run it ONCE as the normal user
# (ubuntu or opc), not as root:
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

if command -v apt-get >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y git curl ca-certificates xvfb
  NODE_SETUP="https://deb.nodesource.com/setup_22.x"
  NODE_INSTALL="sudo apt-get install -y nodejs"
else
  sudo dnf install -y git curl ca-certificates xorg-x11-server-Xvfb xorg-x11-xauth
  NODE_SETUP="https://rpm.nodesource.com/setup_22.x"
  NODE_INSTALL="sudo dnf install -y nodejs"
fi

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL "$NODE_SETUP" | sudo -E bash -
  $NODE_INSTALL
fi

# Oracle's small VMs have little memory and no swap. Chromium needs room.
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 4000 ] && ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"
cd "$DIR/businesses/jobs/runner"
git pull --ff-only
npm install --omit=dev
# Playwright's own Chromium, plus the system libraries it needs. On a distro it
# does not know (Oracle Linux), the libraries are installed by hand below.
if command -v apt-get >/dev/null; then
  sudo "$(command -v node)" node_modules/playwright-core/cli.js install-deps chromium
else
  sudo dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib pango cairo libX11 libXext libxcb at-spi2-core liberation-fonts dejavu-sans-fonts || true
fi
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
ExecStart=$(command -v xvfb-run) -a --server-args="-screen 0 1366x850x24" $(command -v node) run.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable jobs-runner

echo
echo "הותקן. עכשיו שים בשרת את שני הקבצים (.env ו-sessions.json) ואז: sudo systemctl start jobs-runner"
