import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Core modules require higher coverage
        'src/core/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/**/*.d.ts'],
    },
    include: ['tests/**/*.test.ts'],
  },
});
