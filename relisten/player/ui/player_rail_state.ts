import { createSessionFlag } from '@/relisten/util/session_flag';

/**
 * Whether the listener wants the player rail open in a wide window. The tabs
 * layout, the mini player, and the full-screen overlay all read it, and they
 * live in different layouts. It starts open.
 */
const playerRailOpen = createSessionFlag(true);

export const setPlayerRailOpen = playerRailOpen.set;
export const usePlayerRailOpen = playerRailOpen.useValue;
