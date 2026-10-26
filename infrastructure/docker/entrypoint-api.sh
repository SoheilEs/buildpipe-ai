#!/bin/sh
set -e
echo '==> Running database migrations...'
npx prisma migrate deploy
echo '==> Seeding database...'
npx tsx prisma/seed.ts || true
echo '==> Starting API...'
exec node apps/api/dist/main.js
