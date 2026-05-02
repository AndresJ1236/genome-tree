# Guía de Deploy — Genome Tree

> Referencia rápida para deployar al servidor de producción TrueNAS.
> Si los skills `/deploy-truenas` o `/setup-cloudflare-tunnel` no están disponibles, sigue este documento.

---

## Datos de conexión SSH

| Campo       | Valor                                      |
|-------------|---------------------------------------------|
| Host        | `192.168.100.58`                            |
| Usuario     | `root`                                      |
| Llave       | `C:\Users\andre\.ssh\truenas_key`           |
| Passphrase  | `andres`                                    |
| Ruta proyecto | `/mnt/The Vault/Tresure/Genome`           |

> **Nota:** El path tiene un espacio ("The Vault") — siempre ponlo entre comillas en shell.

---

## Cómo conectarse desde Windows (PowerShell)

El agente SSH (`ssh-agent`) requiere permisos de administrador y puede no estar disponible.
Usar el SSH de Git con `SSH_ASKPASS` para proveer la passphrase sin interacción:

```powershell
# 1. Crear script temporal para la passphrase
"@echo andres" | Out-File -FilePath "$env:TEMP\askpass.bat" -Encoding ascii

# 2. Configurar variables de entorno
$env:SSH_ASKPASS         = "$env:TEMP\askpass.bat"
$env:SSH_ASKPASS_REQUIRE = "force"
$env:DISPLAY             = "dummy"

# 3. Usar el SSH de Git (no el de Windows)
$ssh = "C:\Program Files\Git\usr\bin\ssh.exe"
$scp = "C:\Program Files\Git\usr\bin\scp.exe"
$key = "$env:USERPROFILE\.ssh\truenas_key"
```

Prueba de conexión:
```powershell
& $ssh -i $key -o StrictHostKeyChecking=no root@192.168.100.58 "echo ok"
```

---

## Procedimiento de deploy completo

### Paso 1 — Subir los archivos cambiados con SCP

```powershell
& $scp -i $key -o StrictHostKeyChecking=no `
  "ruta\local\al\archivo.ts" `
  'root@192.168.100.58:"/mnt/The Vault/Tresure/Genome/ruta/destino/archivo.ts"'
```

> **Importante:** El `.git` del servidor no tiene remote configurado (no se puede hacer `git pull`).
> El método correcto es copiar **solo los archivos modificados** con SCP.

### Paso 2 — Reconstruir el contenedor

```powershell
& $ssh -i $key -o StrictHostKeyChecking=no root@192.168.100.58 `
  "cd '/mnt/The Vault/Tresure/Genome' && docker compose up -d --build app 2>&1"
```

El build tarda ~30-60 segundos. Al final debe mostrar:
```
Container genome-app-1  Started
```

---

## Errores comunes y sus fixes

| Error | Causa | Fix |
|-------|-------|-----|
| `chmod on .git/config.lock failed` | El `.git/` pertenece al usuario `andres`, no a `root` | No usar `git commit` como root — copiar archivos directamente con SCP |
| `su: invalid option` / `This account is currently not available` | `andres` tiene shell `/usr/sbin/nologin` | No usar `su andres`. Operar como root directamente |
| `chmod: changing permissions of entrypoint.sh: Operation not permitted` | El share SMB no permite `chmod` en archivos de Windows | El Dockerfile ya tiene `RUN sed -i 's/\r//' /entrypoint.sh && chmod 755 /entrypoint.sh` — no hace falta hacerlo manualmente |
| `fatal: 'origin' does not appear to be a git repository` | El repo del servidor no tiene remote | Copiar archivos con SCP en vez de `git pull` |
| `ssh-agent: No such file or directory` | El servicio ssh-agent está detenido y requiere admin para iniciar | Usar el workaround `SSH_ASKPASS` con Git's ssh.exe (ver arriba) |
| Contenedor arranca y cae inmediatamente | `entrypoint.sh` tiene line endings CRLF (del share SMB) | El Dockerfile lo corrige con `sed -i 's/\r//'` automáticamente al hacer build |
| Error 502 en Cloudflare Tunnel | El contenedor `app` no está corriendo o no responde en el puerto interno | Revisar `docker compose logs app` |

---

## Arquitectura del servidor

```
TrueNAS SCALE (192.168.100.58)
└── Docker Compose: /mnt/The Vault/Tresure/Genome/
    ├── genome-app-1      (Next.js app, puerto interno 3000)
    ├── genome-db-1       (PostgreSQL)
    ├── genome-minio-1    (MinIO / S3-compatible storage)
    ├── genome-nginx-1    (reverse proxy)
    └── genome-cloudflared-1  (Cloudflare Tunnel → dominio público)
```

El tráfico externo llega por Cloudflare Tunnel → cloudflared → nginx → app.

---

## Historial de fixes importantes

- **entrypoint.sh sin bit de ejecución** — el share SMB borra permisos. Solucionado en el Dockerfile con `chmod 755` en el runner stage.
- **dependencias `pg` faltantes en standalone build** — se agregaron capas extra en el Dockerfile para copiar `node_modules/pg`, `node_modules/postgres-array`, etc.
- **`/setup` bloqueado por middleware** — el proxy middleware excluye `/setup` de la verificación de JWT.
- **Schema desincronizado** — después de cambios en `schema.prisma`, correr manualmente: `docker compose exec app npx prisma db push`
