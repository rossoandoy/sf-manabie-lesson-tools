import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/services/e2e-sandbox.live.test.ts'],
    testTimeout: 120_000,
  },
});
