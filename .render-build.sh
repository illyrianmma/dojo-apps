#!/usr/bin/env bash
set -e

# Render runs builds in /opt/render/project/src
echo "[render] Ensuring persistent folders exist…"
mkdir -p /var/data/uploads || true
mkdir -p /data/uploads || true

# You can add any prestart steps here (migrations, etc.)
