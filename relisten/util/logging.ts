import { consoleTransport, fileAsyncTransport, logger } from 'react-native-logs';
import { InteractionManager } from 'react-native';

export type LogLevels = 'debug' | 'info' | 'warn' | 'error';

export const log = logger.createLogger<LogLevels>({
  transport: __DEV__ ? consoleTransport : fileAsyncTransport,
  severity: __DEV__ ? 'debug' : 'error',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});
