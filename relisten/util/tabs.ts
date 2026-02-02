export const RELISTEN_TAB_KEYS = ['(artists)', '(myLibrary)', '(offline)', '(relisten)'] as const;

export type RelistenTabKey = (typeof RELISTEN_TAB_KEYS)[number];

export const isRelistenTabKey = (value: string | undefined): value is RelistenTabKey =>
  RELISTEN_TAB_KEYS.includes(value as RelistenTabKey);

export const tabKeyToRoute = (key: RelistenTabKey) => `/relisten/tabs/${key}`;
