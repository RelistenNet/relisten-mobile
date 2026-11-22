import { createSessionFlag } from '@/relisten/util/session_flag';

/**
 * Whether the listener wants the library sidebar open beside the content in a
 * wide window. Collapsing it is remembered across launches.
 */
const librarySidebarOpen = createSessionFlag(true, 'librarySidebar.open');

export const setLibrarySidebarOpen = librarySidebarOpen.set;
export const useLibrarySidebarOpen = librarySidebarOpen.useValue;
