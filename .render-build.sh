#!/usr/bin/env bash
set -e
echo "[render] Installing deps…"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
echo "[render] Build step complete."
