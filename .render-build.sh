#!/usr/bin/env bash
set -e

echo "[render] Ensuring persistent folders exist…"
mkdir -p /var/data/uploads || true
mkdir -p /data/uploads || true

# (add prestart steps here later if you like, e.g., DB migrations)
