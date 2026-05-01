# Genome Tree — Documentación del proyecto

Aplicación web privada de árbol genealógico familiar. Auto-hospedada en servidor doméstico, multi-tenant (una instancia sirve múltiples familias), con sistema de permisos por rama y legado de contenido.

---

## Índice

| Documento | Descripción |
|---|---|
| [arquitectura.md](./arquitectura.md) | Stack tecnológico, decisiones de diseño y estructura de archivos |
| [estado-actual.md](./estado-actual.md) | Qué está funcionando hoy y cómo probarlo |
| [fases.md](./fases.md) | Hoja de ruta completa: fases completadas y futuras |

---

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar base de datos (PostgreSQL local)
# Ver docs/estado-actual.md para el setup completo

# 3. Aplicar schema
npx prisma db push

# 4. Poblar datos de prueba
npm run db:seed

# 5. Iniciar servidor de desarrollo
npm run dev
```

Acceder en: http://localhost:3000  
Usuario demo: `admin@demo.com` / `admin123`

---

## Contexto del proyecto

Genome Tree nació con la idea de preservar la memoria familiar de forma digital, elegante y privada. No es un servicio en la nube — vive en el servidor de la casa, los datos nunca salen de la red doméstica. El árbol no es solo una visualización: es un archivo vivo donde cada persona tiene historias, recetas, objetos, diarios y entrevistas adjuntas, con control fino sobre quién puede ver qué.
