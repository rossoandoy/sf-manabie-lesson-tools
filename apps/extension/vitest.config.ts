import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts'],
    exclude: ['**/e2e-sandbox.live.test.ts'],
  },
});
