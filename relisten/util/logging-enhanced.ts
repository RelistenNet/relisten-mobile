import { consoleTransport, sentryTransport, logger } from 'react-native-logs';
import { InteractionManager, NetInfo } from 'react-native';
import * as Sentry from '@sentry/react-native';

// Custom transport that throttles BASS_ERROR_TIMEOUT errors
const throttledSentryTransport = (props: any) => {
  if (!props) return false;
  if (!props?.options?.SENTRY) {
    throw Error(`react-native-logs: throttledSentryTransport - No sentry instance provided`);
  }

  // Check if this is a BASS_ERROR_TIMEOUT error
  const isTimeoutError = 
    typeof props.msg === 'string' && 
    props.msg.includes('BASS_ERROR_TIMEOUT');

  // Only throttle timeout errors
  if (isTimeoutError) {
    // Store last time we sent this error to Sentry and count of occurrences
    if (!global._bassTimeoutErrorState) {
      global._bassTimeoutErrorState = {
        lastReportTime: 0,
        occurrenceCount: 0,
        userIdsWithErrors: new Set(),
      };
    }

    const now = Date.now();
    const state = global._bassTimeoutErrorState;
    const userId = Sentry.getUser()?.id || 'unknown';
    
    // Add user to set of affected users
    state.userIdsWithErrors.add(userId);
    state.occurrenceCount++;

    // Only report once every 15 minutes per user
    if (now - state.lastReportTime > 15 * 60 * 1000) {
      state.lastReportTime = now;

      // Get network information
      try {
        NetInfo.fetch().then(netInfo => {
          // Create enhanced error with additional context
          let enhancedError;
          if (typeof props.msg === 'string') {
            enhancedError = new Error(props.msg);
          } else {
            enhancedError = props.msg;
          }

          // Add extra context
          Sentry.withScope(scope => {
            scope.setExtra('occurredCount', state.occurrenceCount);
            scope.setExtra('affectedUsers', Array.from(state.userIdsWithErrors).length);
            scope.setExtra('networkType', netInfo.type);
            scope.setExtra('isConnected', netInfo.isConnected);
            scope.setExtra('isInternetReachable', netInfo.isInternetReachable);
            scope.setExtra('details', netInfo.details);
            
            // Also include device info through the native Sentry implementation
            props.options.SENTRY.captureException(enhancedError);
          });
        });
      } catch (error) {
        // Fallback if NetInfo fails
        props.options.SENTRY.captureException(props.msg);
      }
    }

    // Always log to console
    console.warn(`[BASS Timeout] Occurred ${state.occurrenceCount} times for ${state.userIdsWithErrors.size} users`);
    return true;
  } else {
    // For non-timeout errors, use the regular Sentry transport
    try {
      let isError = true;
      if (props?.options?.errorLevels) {
        isError = false;
        if (Array.isArray(props?.options?.errorLevels)) {
          if (props.options.errorLevels.includes(props.level.text)) {
            isError = true;
          }
        } else {
          if (props.options.errorLevels === props.level.text) {
            isError = true;
          }
        }
      }

      if (isError) {
        props.options.SENTRY.captureException(props.msg);
      } else {
        props.options.SENTRY.addBreadcrumb(props.msg);
      }
      return true;
    } catch (error) {
      throw Error(`react-native-logs: throttledSentryTransport - Error on send msg to Sentry`);
    }
  }
};

export const log = logger.createLogger({
  transport: [consoleTransport, throttledSentryTransport],
  transportOptions: {
    // @ts-expect-error this is what the docs say and the typing is wrong for react-native-logs
    SENTRY: Sentry,
    errorLevels: 'error',
  },
  severity: __DEV__ ? 'debug' : 'info',
  async: true,
  asyncFunc: InteractionManager.runAfterInteractions,
});

// Add specialized logger for audio streaming issues
export const audioStreamLog = {
  timeoutError: (message: string, details: any = {}) => {
    if (!global._bassTimeoutErrorState) {
      global._bassTimeoutErrorState = {
        lastReportTime: 0,
        occurrenceCount: 0,
        userIdsWithErrors: new Set(),
      };
    }
    
    const state = global._bassTimeoutErrorState;
    const now = Date.now();
    const userId = Sentry.getUser()?.id || 'unknown';
    
    // Add user to set of affected users
    state.userIdsWithErrors.add(userId);
    state.occurrenceCount++;
    
    // Only report once every 15 minutes per user
    if (now - state.lastReportTime > 15 * 60 * 1000) {
      state.lastReportTime = now;
      
      // Get network information
      try {
        NetInfo.fetch().then(netInfo => {
          // Create enhanced error with extra context
          const enhancedError = new Error(message);
          
          // Add extra context
          Sentry.withScope(scope => {
            scope.setExtra('occurredCount', state.occurrenceCount);
            scope.setExtra('affectedUsers', Array.from(state.userIdsWithErrors).length);
            scope.setExtra('networkType', netInfo.type);
            scope.setExtra('isConnected', netInfo.isConnected);
            scope.setExtra('isInternetReachable', netInfo.isInternetReachable);
            scope.setExtra('details', netInfo.details);
            scope.setExtra('streamingDetails', details);
            
            Sentry.captureException(enhancedError);
          });
        });
      } catch (error) {
        // Fallback if NetInfo fails
        Sentry.captureException(new Error(message));
      }
    }
    
    // Always log to console
    console.warn(`[BASS Timeout] ${message} - Occurred ${state.occurrenceCount} times for ${state.userIdsWithErrors.size} users`);
  },
  
  error: (message: string, error: any) => {
    log.error(message, error);
  },
  
  warning: (message: string, details: any = {}) => {
    log.warn(message, details);
  },
  
  info: (message: string, details: any = {}) => {
    log.info(message, details);
  }
};
