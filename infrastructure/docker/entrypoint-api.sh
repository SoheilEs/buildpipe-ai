#!/bin/sh
set -e
echo '==> Running database migrations...'
npx prisma db push
echo '==> Seeding database...'
npx tsx prisma/seed.ts || true
echo '==> Starting API...'
exec node apps/api/dist/main.js
