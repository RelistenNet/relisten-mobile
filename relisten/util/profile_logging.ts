type NavigationRouteLike = {
  name: string;
  state?: NavigationStateLike;
};

type NavigationStateLike = {
  index?: number;
  routes: readonly NavigationRouteLike[];
};

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

export function createRouteDebugSignature(pathname: string, stack: string) {
  return `${pathname}::${stack}`;
}

export function describeNavigationStack(state?: NavigationStateLike): string {
  if (!state || !state.routes.length) {
    return '<empty>';
  }

  const routes: string[] = [];
  let currentState: NavigationStateLike | undefined = state;

  while (currentState && currentState.routes.length > 0) {
    const index = currentState.index ?? currentState.routes.length - 1;
    const route: NavigationRouteLike = currentState.routes[index];
    routes.push(route.name);
    currentState = route.state;
  }

  return routes.join(' > ');
}

function logVerboseProfileDebug(prefix: string, message: string) {
  if (!isVerboseProfileLoggingEnabled()) {
    return;
  }

  console.log(`[${prefix}] ${message}`);
}
