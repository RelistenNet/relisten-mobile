import type { NavigationState, PartialState } from '@react-navigation/native';

export const ENABLE_VERBOSE_PROFILE_LOGGING = false;

export function isVerboseProfileLoggingEnabled() {
  return __DEV__ && ENABLE_VERBOSE_PROFILE_LOGGING;
}

export function logRouteDebug(message: string) {
  logVerboseProfileDebug('RouteDebug', message);
}

export function logTabRootDebug(message: string) {
  logVerboseProfileDebug('TabRootDebug', message);
}

export function logLibraryIndexDebug(message: string) {
  logVerboseProfileDebug('LibraryIndexDebug', message);
}

export function describeRoutingQueueAction(action: unknown) {
  if (!action || typeof action !== 'object' || !('type' in action)) {
    return String(action);
  }

  const type = typeof action.type === 'string' ? action.type : 'unknown';
  const payload =
    'payload' in action && action.payload && typeof action.payload === 'object'
      ? action.payload
      : undefined;

  if (type === 'ROUTER_LINK') {
    const href =
      payload && 'href' in payload && typeof payload.href === 'string' ? payload.href : undefined;
    const options = payload && 'options' in payload ? safeStringify(payload.options) : undefined;

    return [type, href ? `href=${href}` : undefined, options ? `options=${options}` : undefined]
      .filter(Boolean)
      .join(' ');
  }

  const details = payload ? safeStringify(payload) : undefined;

  return [type, details ? `payload=${details}` : undefined].filter(Boolean).join(' ');
}

export function createRouteDebugSignature(pathname: string, stack: string) {
  return `${pathname}::${stack}`;
}

export function describeNavigationStack(
  state?: NavigationState | PartialState<NavigationState> | undefined
): string {
  if (!state || !state.routes.length) {
    return '<empty>';
  }

  const routes: string[] = [];
  let currentState: NavigationState | PartialState<NavigationState> | undefined = state;

  while (currentState && currentState.routes.length > 0) {
    const index = currentState.index ?? currentState.routes.length - 1;
    const route = currentState.routes[index] as {
      name: string;
      state?: NavigationState | PartialState<NavigationState>;
    };
    routes.push(route.name);
    currentState =
      route.state && 'routes' in route.state
        ? (route.state as NavigationState | PartialState<NavigationState>)
        : undefined;
  }

  return routes.join(' > ');
}

function logVerboseProfileDebug(prefix: string, message: string) {
  if (!isVerboseProfileLoggingEnabled()) {
    return;
  }

  console.log(`[${prefix}] ${message}`);
}

function safeStringify(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
