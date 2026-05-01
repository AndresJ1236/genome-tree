import assert from 'node:assert/strict'
import { extractSurnameTokens, hasCompatibleManagedUnitSurname, normalizeSurname } from '@/lib/managed-family-unit'

assert.equal(normalizeSurname('Martinez'), 'martinez', 'debe normalizar tildes')
assert.deepEqual(
  extractSurnameTokens('Martinez Santos'),
  ['martinez', 'santos'],
  'debe separar apellidos compuestos por espacios'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Martinez Santos', 'Martinez', 'Santos'),
  true,
  'debe aceptar coincidencia directa con ambos apellidos de la unidad'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Santos Vazquez', 'Martinez', 'Santos'),
  true,
  'debe aceptar coincidencia parcial con el apellido secundario de la unidad'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Vasquez Ruiz', 'Martinez', 'Santos'),
  false,
  'no debe aceptar apellidos ajenos a la unidad'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Lopez Vega', null, null),
  true,
  'si la unidad no define apellidos, no debe bloquear por compatibilidad'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Ruiz Ortega', 'Martinez', 'Santos', 'Martinez', null),
  true,
  'debe aceptar compatibilidad por apellido de nacimiento aunque el lastName actual no coincida'
)

assert.equal(
  hasCompatibleManagedUnitSurname('Ruiz Ortega', 'Martinez', 'Santos', null, 'Santos'),
  true,
  'debe aceptar el segundo apellido de nacimiento como coincidencia valida'
)

console.log('managed-family-unit-transfer ok')
