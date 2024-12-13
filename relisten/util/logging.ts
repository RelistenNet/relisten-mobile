import { consoleTransport, fileAsyncTransport, logger } from 'react-native-logs';
import { InteractionManager } from 'react-native';

export type LogLevels = 'debug' | 'info' | 'warn' | 'error';

export const log = logger.createLogger<LogLevels>({
  // TODO: when we have entry, also log to a file so that we can attach it to crash reports
  transport: consoleTransport,
  severity: __DEV__ ? 'debug' : 'info',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});
