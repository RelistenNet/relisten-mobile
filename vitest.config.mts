import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['relisten/**/*.test.ts'],
    maxWorkers: 1,
  },
});
