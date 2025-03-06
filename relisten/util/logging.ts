import { consoleTransport, sentryTransport, logger } from 'react-native-logs';
import { InteractionManager } from 'react-native';
import * as Sentry from '@sentry/react-native';

export const log = logger.createLogger({
  // TODO: when we have entry, also log to a file so that we can attach it to crash reports
  transport: [consoleTransport, sentryTransport],
  transportOptions: {
    // @ts-expect-error this is what the docs say and the typing is wrong for react-native-logs
    SENTRY: Sentry,
    errorLevels: 'error',
  },
  severity: __DEV__ ? 'debug' : 'info',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});
