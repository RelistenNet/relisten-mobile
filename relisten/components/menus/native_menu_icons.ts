import { Icon } from '@expo/ui';

export const nativeMenuIcons = {
  // Relisten has no profile photos, so the account is a plain person icon:
  // outlined signed out, filled signed in, badged when sync needs attention.
  // Material Symbols has one account icon, so Android shows the same for each.
  account: Icon.select({
    ios: 'person.crop.circle',
    android: import('@expo/material-symbols/account_circle.xml'),
  }),
  accountSignedIn: Icon.select({
    ios: 'person.crop.circle.fill',
    android: import('@expo/material-symbols/account_circle.xml'),
  }),
  accountNeedsAttention: Icon.select({
    ios: 'person.crop.circle.badge.exclamationmark',
    android: import('@expo/material-symbols/account_circle.xml'),
  }),
  audioAdjustments: Icon.select({
    ios: 'slider.horizontal.3',
    android: import('@expo/material-symbols/tune.xml'),
  }),
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
  clearHistory: Icon.select({
    ios: 'trash',
    android: import('@expo/material-symbols/delete_sweep.xml'),
  }),
  done: Icon.select({
    ios: 'checkmark',
    android: import('@expo/material-symbols/check.xml'),
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
  search: Icon.select({
    ios: 'magnifyingglass',
    android: import('@expo/material-symbols/search.xml'),
  }),
  share: Icon.select({
    ios: 'square.and.arrow.up',
    android: import('@expo/material-symbols/share.xml'),
  }),
  lock: Icon.select({
    ios: 'lock',
    android: import('@expo/material-symbols/lock.xml'),
  }),
  copy: Icon.select({
    ios: 'doc.on.doc',
    android: import('@expo/material-symbols/content_copy.xml'),
  }),
  report: Icon.select({
    ios: 'flag',
    android: import('@expo/material-symbols/flag.xml'),
  }),
  show: Icon.select({
    ios: 'calendar',
    android: import('@expo/material-symbols/event.xml'),
  }),
  switchSource: Icon.select({
    ios: 'rectangle.on.rectangle',
    android: import('@expo/material-symbols/swap_horiz.xml'),
  }),
  add: Icon.select({
    ios: 'plus',
    android: import('@expo/material-symbols/add.xml'),
  }),
  addToPlaylist: Icon.select({
    ios: 'text.badge.plus',
    android: import('@expo/material-symbols/playlist_add.xml'),
  }),
  edit: Icon.select({
    ios: 'pencil',
    android: import('@expo/material-symbols/edit.xml'),
  }),
  group: Icon.select({
    ios: 'link',
    android: import('@expo/material-symbols/link.xml'),
  }),
  moveDown: Icon.select({
    ios: 'arrow.down',
    android: import('@expo/material-symbols/arrow_downward.xml'),
  }),
  moveToBottom: Icon.select({
    ios: 'arrow.down.to.line',
    android: import('@expo/material-symbols/vertical_align_bottom.xml'),
  }),
  moveToTop: Icon.select({
    ios: 'arrow.up.to.line',
    android: import('@expo/material-symbols/vertical_align_top.xml'),
  }),
  moveUp: Icon.select({
    ios: 'arrow.up',
    android: import('@expo/material-symbols/arrow_upward.xml'),
  }),
  playlist: Icon.select({
    ios: 'music.note.list',
    android: import('@expo/material-symbols/queue_music.xml'),
  }),
  select: Icon.select({
    ios: 'checklist',
    android: import('@expo/material-symbols/checklist.xml'),
  }),
  ungroup: Icon.select({
    ios: 'rectangle.split.3x1',
    android: import('@expo/material-symbols/link_off.xml'),
  }),
  song: Icon.select({
    ios: 'music.note',
    android: import('@expo/material-symbols/music_note.xml'),
  }),
  goTo: Icon.select({
    ios: 'arrow.forward',
    android: import('@expo/material-symbols/arrow_forward.xml'),
  }),
} as const;
