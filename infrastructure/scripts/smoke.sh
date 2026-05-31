#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"

echo "==> Health check"
curl -sf "$API_URL/health" | grep -q '"status":"ok"'

echo "==> Readiness check"
curl -sf "$API_URL/health/ready"

echo "==> Register test user"
REGISTER=$(curl -sf -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.buildpipe.ai","password":"SmokeTest123!"}')

echo "==> Login"
LOGIN=$(curl -sf -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.buildpipe.ai","password":"SmokeTest123!"}')

TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "==> Get profile"
curl -sf "$API_URL/users/me" -H "Authorization: Bearer $TOKEN"

echo "==> List incidents"
curl -sf "$API_URL/incidents" -H "Authorization: Bearer $TOKEN"

echo "==> Smoke test passed"
