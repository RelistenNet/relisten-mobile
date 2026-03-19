import { ShowOfflineTabSetting } from '@/relisten/realm/models/user_settings';

export function shouldShowOfflineTab(
  setting: ShowOfflineTabSetting | null | undefined,
  offline: boolean
) {
  const resolvedSetting = setting ?? ShowOfflineTabSetting.Always;

  return (
    resolvedSetting === ShowOfflineTabSetting.Always ||
    (resolvedSetting === ShowOfflineTabSetting.WhenOffline && offline)
  );
}
