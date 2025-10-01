#!/usr/bin/env bash
set -e

# Ensure fresh build of sqlite3
npm install --build-from-source sqlite3
