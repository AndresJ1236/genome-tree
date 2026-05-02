#!/bin/sh
set -e

echo "[genome-tree] Applying database schema..."
./node_modules/.bin/prisma db push --skip-generate

echo "[genome-tree] Starting server..."
exec node server.js
