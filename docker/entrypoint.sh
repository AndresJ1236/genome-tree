#!/bin/sh
set -e
echo "[genome-tree] Applying schema changes..."
node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1 || true
echo "[genome-tree] Starting server..."
exec node server.js
