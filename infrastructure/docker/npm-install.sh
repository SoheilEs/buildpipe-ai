#!/bin/sh
set -e

max_attempts="${NPM_INSTALL_RETRIES:-5}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  echo "npm install attempt ${attempt}/${max_attempts}"
  if npm install --no-audit --no-fund; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "npm install failed after ${max_attempts} attempts"
    exit 1
  fi

  wait_seconds=$((attempt * 15))
  echo "npm install failed, retrying in ${wait_seconds}s..."
  sleep "$wait_seconds"
  attempt=$((attempt + 1))
done