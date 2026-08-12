import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    // mongodb-memory-server birinchi ishga tushishda binary yuklab olishi mumkin
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
