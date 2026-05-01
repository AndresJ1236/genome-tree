# Diseno - Import / Export de relaciones JSON

Fecha: 2026-05-01

## Objetivo

Agregar una primera version de importacion y exportacion en JSON limitada a relaciones familiares:
- `fatherId`
- `motherId`
- estructura visible de padres / hijos derivada de esas relaciones

Fuera de alcance en este bloque:
- historias
- fotos
- recetas
- objetos
- diario
- entrevistas
- fuentes
- relaciones importantes
- creacion de personas nuevas durante la importacion

## Regla de permisos

- exportar JSON de relaciones: cualquier usuario autenticado
- el export solo incluye las personas y relaciones que ese usuario puede ver
- importar JSON de relaciones: solo `ADMIN` de la familia

## Formato JSON

```json
{
  "familySlug": "familia-demo",
  "exportedAt": "2026-05-01T12:30:00.000Z",
  "people": [
    {
      "id": "seed-carlos",
      "firstName": "Carlos",
      "middleName": null,
      "lastName": "Martinez",
      "birthSurname1": "Martinez",
      "birthSurname2": "Santos",
      "fatherId": null,
      "motherId": null
    }
  ]
}
```

Regla importante:
- si `fatherId` o `motherId` apuntan a una persona fuera del conjunto visible exportado, se serializan como `null`

## Comportamiento de export

- endpoint protegido que devuelve `application/json`
- toma todas las personas visibles para la sesion actual
- incluye solo identidad minima y `fatherId` / `motherId`
- no incluye contenido narrativo ni media

## Comportamiento de import

- accion protegida para `ADMIN`
- recibe texto JSON desde la UI de administracion
- valida:
  - JSON valido
  - `familySlug` compatible con la familia actual
  - todas las personas del payload existen ya en la familia
  - todos los `fatherId` / `motherId` referenciados existen ya en la familia
  - nadie puede quedar como padre o madre de si mismo
- actualiza solo relaciones `fatherId` y `motherId`
- no crea personas nuevas

## UI

- export:
  - boton visible en la vista del arbol
  - disponible para cualquier usuario autenticado
- import:
  - bloque nuevo en `Administracion`
  - visible solo para `ADMIN`
  - textarea o carga de archivo JSON
  - resumen de resultado con cantidad de personas actualizadas

## Verificacion

1. snapshot previo
2. implementar un solo tema: `relations-json`
3. `.\scripts\start-runner.ps1`
4. `.\scripts\verify-runtime.ps1`
5. prueba funcional corta:
   - export desde usuario normal
   - importar desde admin
   - verificar que el arbol sigue abriendo
