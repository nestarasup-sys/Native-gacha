import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/editor-v6/**/*.test.ts', 'tests/editor-v6/**/*.test.tsx'],
    environment: 'node',
    clearMocks: true,
    isolate: true
  }
})
