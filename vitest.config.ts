import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Solo tests escritos con describe/it de vitest. Los archivos legacy
    // que usan node:assert directamente (access-rules, managed-*, etc.)
    // se ejecutan manualmente con `npx tsx tests/<name>.test.ts` y se
    // excluyen aquí para que `npm test` no los marque como fallidos.
    include: [
      'tests/tree-layout.test.ts',
      'tests/kinship.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: ['tests/**/*.spec.js', 'node_modules/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
