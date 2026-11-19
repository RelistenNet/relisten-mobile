import { type useRouter, useSegments } from 'expo-router';

/**
 * Account screens live inside the My Library and Relisten tabs, so they open
 * with the tab bar still showing. Each path stays in the tab it starts from.
 */
export type AccountTab = '(myLibrary)' | '(relisten)';

export function accountPath(tab: AccountTab) {
  return `/relisten/tabs/${tab}/account` as const;
}

export function usernamePath(tab: AccountTab) {
  return `/relisten/tabs/${tab}/account/username` as const;
}

/** The tab the current screen belongs to; anywhere else uses the Relisten tab. */
export function useAccountTab(): AccountTab {
  const segments: string[] = useSegments();
  return segments.includes('(myLibrary)') ? '(myLibrary)' : '(relisten)';
}

/**
 * Asks to sign in over the current screen, which stays where it was. The
 * sheet closes once the listener is signed in. `reason` finishes
 * "Sign in to …" for an action the screen will run afterwards, such as
 * "follow this playlist"; without one, the sheet uses its general title.
 */
export function openSignInSheet(router: ReturnType<typeof useRouter>, reason?: string) {
  router.push({ pathname: '/relisten/sign-in', params: reason ? { reason } : {} });
}
