import { consoleTransport, crashlyticsTransport, logger } from 'react-native-logs';
import { InteractionManager } from 'react-native';
import { getCrashlytics, log as crashlyticsLog } from '@react-native-firebase/crashlytics';

const crashlyticsModule = getCrashlytics();

export const log = logger.createLogger({
  // TODO: when we have entry, also log to a file so that we can attach it to crash reports
  transport: [consoleTransport, crashlyticsTransport],
  transportOptions: {
    CRASHLYTICS: {
      recordError: (msg: string) => crashlyticsLog(crashlyticsModule, msg),
      log: (msg: string) => crashlyticsLog(crashlyticsModule, msg),
    },
  },
  severity: __DEV__ ? 'debug' : 'info',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});
