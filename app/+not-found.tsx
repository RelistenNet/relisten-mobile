import {
  Redirect,
  Unmatched,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
} from 'expo-router';
import { log } from '@/relisten/util/logging';
import {
  formatSafeRouteForLogging,
  sanitizeSearchParamsForNavigation,
} from '@/relisten/linking/sanitizer';

const logger = log.extend('not-found');

export default function Page() {
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams();
  const rootNavigationState = useRootNavigationState();

  if (!rootNavigationState?.key) return null;

  const [, artistSlug] = pathname.split('/');
  const safeRouteForLogging = formatSafeRouteForLogging(pathname, globalSearchParams);
  const safeSearchParams = sanitizeSearchParamsForNavigation(globalSearchParams);

  if (artistSlug && artistSlug !== 'relisten' && artistSlug !== 'web') {
    // deep link from web
    logger.info(`redirecting to /web${safeRouteForLogging}`);
    return <Redirect href={{ pathname: '/web' + pathname, params: safeSearchParams }} />;
  }

  logger.error(`Totally unknown route: ${safeRouteForLogging}`);

  return <Unmatched />;
}
