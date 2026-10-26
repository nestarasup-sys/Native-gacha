import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/editor-v6/**/*.test.ts'],
    environment: 'node',
    clearMocks: true
  }
})
