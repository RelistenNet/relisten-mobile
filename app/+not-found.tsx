import {
  Redirect,
  Unmatched,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
} from 'expo-router';
import { log } from '@/relisten/util/logging';

const logger = log.extend('not-found');

export default function Page() {
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams();
  const rootNavigationState = useRootNavigationState();

  if (!rootNavigationState?.key) return null;

  const [, artistSlug] = pathname.split('/');

  if (artistSlug && artistSlug !== 'relisten' && artistSlug !== 'web') {
    // deep link from web
    logger.info(`redirecting to /web${pathname} ${JSON.stringify(globalSearchParams)}`);
    return <Redirect href={{ pathname: '/web' + pathname, params: globalSearchParams }} />;
  }

  logger.error(`Totally unknown route: ${pathname} ${JSON.stringify(globalSearchParams)}`);

  return <Unmatched />;
}
