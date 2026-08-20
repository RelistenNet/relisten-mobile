import { vi } from 'vitest';

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock('@/relisten/util/logging', () => ({
  log: Object.assign(logger, { extend: () => logger }),
}));

vi.mock('@sentry/react-native', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/tmp',
    join: (...parts: string[]) => parts.join('/'),
  },
}));

vi.mock('@/relisten/events', () => ({
  sharedStatsigClient: () => ({
    getDynamicConfig: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  }),
}));
