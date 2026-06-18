#!/usr/bin/env bash
# render-build.sh
# Set this as your Render Build Command: bash render-build.sh

set -e

echo "--- Installing Python dependencies ---"
pip install -r requirements.txt

echo "--- Installing Playwright browser binaries ---"
python -m playwright install chromium
python -m playwright install-deps chromium

echo "--- Build complete ---"
