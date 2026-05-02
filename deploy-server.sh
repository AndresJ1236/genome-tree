#!/bin/bash
set -e

DEPLOY_DIR="NAS_PATH/genome-tree"

echo "==> Verificando Docker..."
docker --version
docker compose version

echo "==> Copiando .env de produccion..."
cp "$DEPLOY_DIR/.env.production" "$DEPLOY_DIR/.env"

echo "==> Construyendo y arrancando contenedores..."
cd "$DEPLOY_DIR"
docker compose up -d --build

echo "==> Estado de los contenedores:"
docker compose ps

echo ""
echo "Listo. Abre https://arbol.example.com/setup"
