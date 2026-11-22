import { createSessionFlag } from '@/relisten/util/session_flag';

/**
 * Whether the listener wants the library sidebar beside the content in a
 * wide window. Collapsing it lasts for the session.
 */
const librarySidebarOpen = createSessionFlag(true);

export const setLibrarySidebarOpen = librarySidebarOpen.set;
export const useLibrarySidebarOpen = librarySidebarOpen.useValue;
