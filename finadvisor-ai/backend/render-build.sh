#!/usr/bin/env bash
# render-build.sh
# Run by Render during the build phase (set Build Command to: bash render-build.sh)
#
# Playwright needs two things installed:
#   1. The Python package (already in requirements.txt)
#   2. The actual browser binaries (Chromium) — these are NOT in the pip package
#      and must be downloaded separately.  This script handles that.

set -e

echo "--- Installing Python dependencies ---"
pip install -r requirements.txt

echo "--- Installing Playwright browser binaries ---"
# Install only Chromium (smallest download, ~130MB) — we don't need Firefox/WebKit
playwright install chromium

# Also install the OS-level deps Chromium needs (fonts, libs, etc.)
playwright install-deps chromium

echo "--- Build complete ---"
