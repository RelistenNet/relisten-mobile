import { defineConfig } from 'vitest/config';
import reactNative from '@wojtekmaj/vitest-react-native/testing-library';

export default defineConfig({
  plugins: [reactNative()],
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['{app,relisten,modules}/**/*.{test,spec}.{ts,tsx}'],
    maxWorkers: 1,
  },
});
