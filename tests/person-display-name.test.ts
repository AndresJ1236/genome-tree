import assert from 'node:assert/strict'
import { getPersonDisplayName } from '@/lib/person-name'

assert.equal(
  getPersonDisplayName({ firstName: 'Juan', middleName: '', lastName: 'Perez' }),
  'Juan Perez',
  'debe omitir el segundo nombre cuando no existe'
)

assert.equal(
  getPersonDisplayName({ firstName: 'Juan', middleName: 'Carlos', lastName: 'Perez' }),
  'Juan Carlos Perez',
  'debe incluir el segundo nombre entre nombre y apellido'
)

assert.equal(
  getPersonDisplayName({ firstName: '  Ana ', middleName: ' Maria ', lastName: ' Gomez ' }),
  'Ana Maria Gomez',
  'debe normalizar espacios al formar el nombre visible'
)

console.log('person-display-name ok')
