import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import { useMemo, useState } from 'react';
import { Clipboard } from 'react-native';
import * as Updates from 'expo-updates';

const formatDateTime = (date?: Date | null) => {
  if (!date) {
    return 'Never';
  }

  return date.toLocaleString();
};

const summarizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const shortenId = (updateId?: string | null) => {
  if (!updateId) {
    return 'N/A';
  }

  return updateId.slice(0, 10);
};

export function UpdatesStatusSection() {
  const [showDebug, setShowDebug] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | undefined>(undefined);
  const [actionMessageIsError, setActionMessageIsError] = useState(false);
  const isUpdatesEnabled = Updates.isEnabled;

  const {
    currentlyRunning,
    availableUpdate,
    downloadedUpdate,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    isRestarting,
    checkError,
    downloadError,
    lastCheckForUpdateTimeSinceRestart,
    downloadProgress,
    restartCount,
    isStartupProcedureRunning,
  } = Updates.useUpdates();

  const status = useMemo(() => {
    if (!isUpdatesEnabled) {
      return 'Updates unavailable';
    }

    if (isRestarting) {
      return 'Restarting to apply update...';
    }

    if (isUpdatePending) {
      return 'Update ready (restart to apply)';
    }

    if (isDownloading) {
      if (downloadProgress !== undefined) {
        const percent = Math.round(downloadProgress * 100);
        return `Downloading update (${percent}%)`;
      }

      return 'Downloading update...';
    }

    if (isChecking) {
      return 'Checking for updates...';
    }

    if (isUpdateAvailable) {
      return 'Update available';
    }

    return 'Up to date';
  }, [
    downloadProgress,
    isUpdatesEnabled,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
  ]);

  const source = !isUpdatesEnabled
    ? 'Unavailable'
    : currentlyRunning.isEmbeddedLaunch
      ? 'Built-in bundle'
      : 'Downloaded OTA';
  const currentUpdateId = isUpdatesEnabled
    ? (currentlyRunning.updateId ?? Updates.updateId)
    : undefined;
  const currentChannel =
    isUpdatesEnabled && (currentlyRunning.channel ?? Updates.channel)
      ? (currentlyRunning.channel ?? Updates.channel)
      : 'N/A';
  const currentRuntime =
    isUpdatesEnabled && (currentlyRunning.runtimeVersion ?? Updates.runtimeVersion)
      ? (currentlyRunning.runtimeVersion ?? Updates.runtimeVersion)
      : 'N/A';
  const publishedAt = isUpdatesEnabled
    ? (currentlyRunning.createdAt ?? Updates.createdAt)
    : undefined;

  const diagnostics = useMemo(() => {
    const parts = [
      `status: ${status}`,
      `updatesEnabled: ${isUpdatesEnabled}`,
      `source: ${source}`,
      `currentUpdateId: ${currentUpdateId ?? 'N/A'}`,
      `channel: ${currentChannel}`,
      `runtimeVersion: ${currentRuntime}`,
      `publishedAt: ${formatDateTime(publishedAt)}`,
      `lastChecked: ${formatDateTime(lastCheckForUpdateTimeSinceRestart)}`,
      `checkAutomatically: ${isUpdatesEnabled ? (Updates.checkAutomatically ?? 'N/A') : 'N/A'}`,
      `isStartupProcedureRunning: ${isStartupProcedureRunning}`,
      `isUpdateAvailable: ${isUpdateAvailable}`,
      `isUpdatePending: ${isUpdatePending}`,
      `isChecking: ${isChecking}`,
      `isDownloading: ${isDownloading}`,
      `downloadProgress: ${downloadProgress ?? 'N/A'}`,
      `isRestarting: ${isRestarting}`,
      `restartCount: ${restartCount}`,
      `availableUpdate: ${
        availableUpdate
          ? `${availableUpdate.type}:${availableUpdate.updateId ?? 'embedded'}:${formatDateTime(availableUpdate.createdAt)}`
          : 'N/A'
      }`,
      `downloadedUpdate: ${
        downloadedUpdate
          ? `${downloadedUpdate.type}:${downloadedUpdate.updateId ?? 'embedded'}:${formatDateTime(downloadedUpdate.createdAt)}`
          : 'N/A'
      }`,
      `isEmergencyLaunch: ${currentlyRunning.isEmergencyLaunch}`,
      `emergencyLaunchReason: ${currentlyRunning.emergencyLaunchReason ?? 'N/A'}`,
      `checkError: ${checkError ? summarizeError(checkError) : 'N/A'}`,
      `downloadError: ${downloadError ? summarizeError(downloadError) : 'N/A'}`,
    ];

    return parts.join('\n');
  }, [
    availableUpdate,
    checkError,
    currentChannel,
    currentRuntime,
    currentUpdateId,
    currentlyRunning.emergencyLaunchReason,
    currentlyRunning.isEmergencyLaunch,
    downloadError,
    downloadProgress,
    downloadedUpdate,
    isUpdatesEnabled,
    isChecking,
    isDownloading,
    isRestarting,
    isStartupProcedureRunning,
    isUpdateAvailable,
    isUpdatePending,
    lastCheckForUpdateTimeSinceRestart,
    publishedAt,
    restartCount,
    source,
    status,
  ]);

  const setActionSuccess = (message: string) => {
    setActionMessage(message);
    setActionMessageIsError(false);
  };

  const setActionError = (message: string) => {
    setActionMessage(message);
    setActionMessageIsError(true);
  };

  const onCheckForUpdates = async () => {
    if (!isUpdatesEnabled) {
      setActionError('Update checks are unavailable in this build.');
      return;
    }

    try {
      const result = await Updates.checkForUpdateAsync();

      if (result.isRollBackToEmbedded) {
        setActionSuccess('Rollback to embedded bundle is available.');
        return;
      }

      if (result.isAvailable) {
        setActionSuccess('Update available. Tap "Download update" to fetch it.');
        return;
      }

      setActionSuccess(`No update available (${result.reason}).`);
    } catch (error) {
      setActionError(`Update check failed: ${summarizeError(error)}`);
    }
  };

  const onDownloadUpdate = async () => {
    if (!isUpdatesEnabled) {
      setActionError('Update download is unavailable in this build.');
      return;
    }

    try {
      const result = await Updates.fetchUpdateAsync();

      if (result.isRollBackToEmbedded) {
        setActionSuccess('Rollback update downloaded. Restart to apply.');
        return;
      }

      if (result.isNew) {
        setActionSuccess('Update downloaded. Restart to apply.');
        return;
      }

      setActionSuccess('No new update was downloaded.');
    } catch (error) {
      setActionError(`Update download failed: ${summarizeError(error)}`);
    }
  };

  const onRestartToApply = async () => {
    if (!isUpdatesEnabled) {
      setActionError('Restart-to-apply is unavailable in this build.');
      return;
    }

    try {
      await Updates.reloadAsync();
    } catch (error) {
      setActionError(`Restart failed: ${summarizeError(error)}`);
    }
  };

  const onCopyDiagnostics = () => {
    try {
      Clipboard.setString(diagnostics);
      setActionSuccess('Diagnostics copied to clipboard.');
    } catch (error) {
      setActionError(`Failed to copy diagnostics: ${summarizeError(error)}`);
    }
  };

  const controlsDisabled = !isUpdatesEnabled || isChecking || isDownloading || isRestarting;

  return (
    <Flex column>
      <SectionHeader title="Update Status" />
      <Flex column className="gap-2 p-4 pr-8">
        <RelistenText className="font-semibold">{status}</RelistenText>
        <Flex column className="gap-0.5">
          <RelistenText className="text-sm text-gray-400">Source: {source}</RelistenText>
          <RelistenText className="text-sm text-gray-400">
            Current update: {shortenId(currentUpdateId)}
          </RelistenText>
          <RelistenText className="text-sm text-gray-400">
            Channel: {currentChannel} • Runtime: {currentRuntime}
          </RelistenText>
          <RelistenText className="text-sm text-gray-400">
            Published: {formatDateTime(publishedAt)}
          </RelistenText>
          <RelistenText className="text-sm text-gray-400">
            Last checked: {formatDateTime(lastCheckForUpdateTimeSinceRestart)}
          </RelistenText>
        </Flex>

        {isUpdatesEnabled ? (
          <Flex className="flex-wrap">
            <RelistenButton
              size="xs"
              asyncOnPress={onCheckForUpdates}
              automaticLoadingIndicator
              disabled={controlsDisabled}
              className="mr-2"
            >
              Check for updates
            </RelistenButton>
            {isUpdateAvailable && !isUpdatePending && (
              <RelistenButton
                size="xs"
                asyncOnPress={onDownloadUpdate}
                automaticLoadingIndicator
                disabled={controlsDisabled}
                className="mr-2"
              >
                Download update
              </RelistenButton>
            )}
            {isUpdatePending && (
              <RelistenButton
                size="xs"
                intent="primary"
                asyncOnPress={onRestartToApply}
                automaticLoadingIndicator
                disabled={controlsDisabled}
                className="mr-2"
              >
                Restart to apply
              </RelistenButton>
            )}
          </Flex>
        ) : (
          <Flex className="pl-0.5">
            <RelistenText className="text-sm text-gray-400">
              OTA controls are only available in release/EAS builds.
            </RelistenText>
          </Flex>
        )}

        {!!actionMessage && (
          <RelistenText
            className={actionMessageIsError ? 'text-sm text-red-400' : 'text-sm text-gray-300'}
          >
            {actionMessage}
          </RelistenText>
        )}

        <Flex column className="gap-2">
          <RelistenButton size="xs" intent="outline" onPress={() => setShowDebug((prev) => !prev)}>
            {showDebug ? 'Hide debug details' : 'Show debug details'}
          </RelistenButton>

          {showDebug && (
            <Flex
              column
              className="gap-1 rounded-md border border-white/10 bg-relisten-blue-900 p-3"
            >
              <RelistenText className="text-sm text-gray-300">
                Updates enabled: {isUpdatesEnabled ? 'yes' : 'no'}
              </RelistenText>
              <RelistenText className="text-sm text-gray-300">
                Check automatically:{' '}
                {isUpdatesEnabled ? (Updates.checkAutomatically ?? 'N/A') : 'N/A'}
              </RelistenText>
              <RelistenText className="text-sm text-gray-300">
                Emergency launch: {currentlyRunning.isEmergencyLaunch ? 'yes' : 'no'}
              </RelistenText>
              {currentlyRunning.isEmergencyLaunch && (
                <RelistenText className="text-sm text-amber-300">
                  Emergency reason: {currentlyRunning.emergencyLaunchReason ?? 'N/A'}
                </RelistenText>
              )}
              <RelistenText className="text-sm text-gray-300">
                Available update:{' '}
                {availableUpdate
                  ? `${availableUpdate.type} ${shortenId(availableUpdate.updateId)} (${formatDateTime(availableUpdate.createdAt)})`
                  : 'N/A'}
              </RelistenText>
              <RelistenText className="text-sm text-gray-300">
                Downloaded update:{' '}
                {downloadedUpdate
                  ? `${downloadedUpdate.type} ${shortenId(downloadedUpdate.updateId)} (${formatDateTime(downloadedUpdate.createdAt)})`
                  : 'N/A'}
              </RelistenText>
              {checkError && (
                <RelistenText className="text-sm text-red-400">
                  Check error: {summarizeError(checkError)}
                </RelistenText>
              )}
              {downloadError && (
                <RelistenText className="text-sm text-red-400">
                  Download error: {summarizeError(downloadError)}
                </RelistenText>
              )}
              <RelistenButton size="xs" intent="outline" onPress={onCopyDiagnostics}>
                Copy diagnostics
              </RelistenButton>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
