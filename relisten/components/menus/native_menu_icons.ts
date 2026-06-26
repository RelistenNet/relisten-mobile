import { Icon } from '@expo/ui';

export const nativeMenuIcons = {
  addToQueue: Icon.select({
    ios: 'text.append',
    android: import('@expo/material-symbols/playlist_add.xml'),
  }),
  artist: Icon.select({
    ios: 'person',
    android: import('@expo/material-symbols/artist.xml'),
  }),
  cancel: Icon.select({
    ios: 'xmark.circle',
    android: import('@expo/material-symbols/cancel.xml'),
  }),
  collapse: Icon.select({
    ios: 'chevron.down',
    android: import('@expo/material-symbols/keyboard_arrow_down.xml'),
  }),
  clearHistory: Icon.select({
    ios: 'trash',
    android: import('@expo/material-symbols/delete_sweep.xml'),
  }),
  close: Icon.select({
    ios: 'xmark',
    android: import('@expo/material-symbols/close.xml'),
  }),
  delete: Icon.select({
    ios: 'trash',
    android: import('@expo/material-symbols/delete.xml'),
  }),
  deleteAll: Icon.select({
    ios: 'trash.fill',
    android: import('@expo/material-symbols/delete_forever.xml'),
  }),
  deleteLegacy: Icon.select({
    ios: 'externaldrive.badge.xmark',
    android: import('@expo/material-symbols/folder_delete.xml'),
  }),
  download: Icon.select({
    ios: 'arrow.down.circle',
    android: import('@expo/material-symbols/download.xml'),
  }),
  favorite: Icon.select({
    ios: 'heart',
    android: import('@expo/material-symbols/favorite.xml'),
  }),
  more: Icon.select({
    ios: 'ellipsis.circle',
    android: import('@expo/material-symbols/more_vert.xml'),
  }),
  play: Icon.select({
    ios: 'play.fill',
    android: import('@expo/material-symbols/play_arrow.xml'),
  }),
  playNext: Icon.select({
    ios: 'text.insert',
    android: import('@expo/material-symbols/add_to_queue.xml'),
  }),
  removeFromQueue: Icon.select({
    ios: 'trash',
    android: import('@expo/material-symbols/remove_from_queue.xml'),
  }),
  retry: Icon.select({
    ios: 'arrow.clockwise.circle',
    android: import('@expo/material-symbols/refresh.xml'),
  }),
  share: Icon.select({
    ios: 'square.and.arrow.up',
    android: import('@expo/material-symbols/share.xml'),
  }),
  show: Icon.select({
    ios: 'calendar',
    android: import('@expo/material-symbols/event.xml'),
  }),
  switchSource: Icon.select({
    ios: 'rectangle.on.rectangle',
    android: import('@expo/material-symbols/swap_horiz.xml'),
  }),
  toolbarMore: Icon.select({
    ios: 'ellipsis',
    android: import('@expo/material-symbols/more_vert.xml'),
  }),
} as const;
