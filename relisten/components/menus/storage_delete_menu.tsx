import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { log } from '@/relisten/util/logging';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';

const logger = log.extend('storage-usage');

const ACTION_IDS = {
  all: 'all',
  downloads: 'downloads',
  legacy: 'legacy',
} as const;

type StorageDeleteActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];

const CONFIRMATIONS = {
  [ACTION_IDS.downloads]: {
    confirmLabel: 'Delete Downloads',
    message:
      'This will remove all downloaded tracks. You will need an internet connection to play them again.',
    title: 'Delete All Downloaded Tracks?',
  },
  [ACTION_IDS.legacy]: {
    confirmLabel: 'Delete Legacy Data',
    message: 'This will clear data from the previous Relisten version and cannot be undone.',
    title: 'Delete Legacy Data?',
  },
  [ACTION_IDS.all]: {
    confirmLabel: 'Delete All',
    message:
      'This will remove every downloaded track and all data from the previous Relisten version.',
    title: 'Delete All Offline Data?',
  },
} as const;

type StorageDeleteMenuProps = {
  canDeleteDownloads: boolean;
  canDeleteLegacy: boolean;
  onDeleted: () => void;
};

export function StorageDeleteMenu({
  canDeleteDownloads,
  canDeleteLegacy,
  onDeleted,
}: StorageDeleteMenuProps) {
  const [deleting, setDeleting] = useState(false);
  const actions = useMemo<MenuAction[]>(() => {
    const nextActions: MenuAction[] = [];

    if (canDeleteDownloads) {
      nextActions.push({
        id: ACTION_IDS.downloads,
        image: nativeMenuIcons.delete,
        title: 'Delete Downloaded Tracks…',
        attributes: { destructive: true },
      });
    }

    if (canDeleteLegacy) {
      nextActions.push({
        id: ACTION_IDS.legacy,
        image: nativeMenuIcons.deleteLegacy,
        title: 'Delete Legacy Data…',
        attributes: { destructive: true },
      });
    }

    if (canDeleteDownloads && canDeleteLegacy) {
      nextActions.push({
        id: ACTION_IDS.all,
        image: nativeMenuIcons.deleteAll,
        title: 'Delete All Offline Data…',
        attributes: { destructive: true },
      });
    }

    return nextActions;
  }, [canDeleteDownloads, canDeleteLegacy]);

  const disabled = actions.length === 0;

  const deleteStorage = useCallback(
    async (actionId: StorageDeleteActionId) => {
      setDeleting(true);

      const deletionPromises: Promise<unknown>[] = [];

      if (actionId === ACTION_IDS.downloads || actionId === ACTION_IDS.all) {
        deletionPromises.push(
          DownloadManager.SHARED_INSTANCE.removeAllDownloads()
            .then(() => logger.info('Deleted all downloads'))
            .catch((reason) => logger.error(`Error deleting downloads: ${JSON.stringify(reason)}`))
        );
      }

      if (actionId === ACTION_IDS.legacy || actionId === ACTION_IDS.all) {
        deletionPromises.push(
          DownloadManager.SHARED_INSTANCE.removeAllLegacyDownloads()
            .then(() => logger.info('Deleted all legacy data'))
            .catch((reason) =>
              logger.error(`Error deleting legacy downloads: ${JSON.stringify(reason)}`)
            )
        );
      }

      await Promise.all(deletionPromises);
      setDeleting(false);
      onDeleted();
    },
    [onDeleted]
  );

  const confirmDelete = useCallback(
    (actionId: StorageDeleteActionId) => {
      confirmDestructiveAction({
        ...CONFIRMATIONS[actionId],
        onConfirm: () => deleteStorage(actionId),
      });
    },
    [deleteStorage]
  );

  const button = (
    <RelistenButton
      accessibilityLabel="Delete offline data"
      disabled={disabled || deleting}
      icon={deleting ? <ActivityIndicator /> : undefined}
    >
      Delete
    </RelistenButton>
  );

  if (disabled || deleting) {
    return button;
  }

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => confirmDelete(nativeEvent.event as StorageDeleteActionId)}
    >
      {button}
    </NativeMenuView>
  );
}
