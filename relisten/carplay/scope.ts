export type CarPlayScope = 'browse' | 'offline' | 'library';

export const SCOPE_META: Record<CarPlayScope, { title: string; tabTitle: string }> = {
  browse: { title: 'Relisten', tabTitle: 'Browse' },
  offline: { title: 'Offline', tabTitle: 'Offline' },
  library: { title: 'My Library', tabTitle: 'Library' },
};
