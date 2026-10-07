#!/usr/bin/env bash
# Pulls the latest runner code and restarts it. Run on the server.
set -euo pipefail
cd "$HOME/floa/businesses/jobs/runner"
git pull --ff-only
npm install --omit=dev
sudo systemctl restart jobs-runner
sudo systemctl status jobs-runner --no-pager | head -5
