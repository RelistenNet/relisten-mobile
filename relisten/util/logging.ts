import { consoleTransport, crashlyticsTransport, logger } from 'react-native-logs';
import { InteractionManager } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';

const crashlyticsModule = crashlytics();

export type LogLevels = 'debug' | 'info' | 'warn' | 'error';

export const log = logger.createLogger<LogLevels>({
  // TODO: when we have entry, also log to a file so that we can attach it to crash reports
  transport: [consoleTransport, crashlyticsTransport],
  transportOptions: {
    CRASHLYTICS: crashlyticsModule,
  },
  severity: __DEV__ ? 'debug' : 'info',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});
