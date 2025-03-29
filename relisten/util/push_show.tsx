import { Href, Link, LinkProps, useRouter } from 'expo-router';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { RelistenTabGroupSegment, useGroupSegment } from '@/relisten/util/routes';
import { AutoselectPrimarySource, UserSettings } from '@/relisten/realm/models/user_settings';
import { NavigationOptions } from 'expo-router/build/global-state/routing';
import { useMemo } from 'react';

export interface PushShowOptions {
  artistUuid: string;
  showUuid: string;
  sourceUuid?: string;
  playTrackUuid?: string;

  overrideGroupSegment?: RelistenTabGroupSegment;
}

function showHref(
  userSettings: UserSettings,
  groupSegment: RelistenTabGroupSegment,
  { artistUuid, showUuid, sourceUuid, playTrackUuid, overrideGroupSegment }: PushShowOptions
): Href {
  const effectiveGroupSegement = overrideGroupSegment ?? groupSegment;

  // if a specific source is specified, go right to it
  if (sourceUuid && sourceUuid !== 'initial') {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid,
        showUuid,
        sourceUuid,
        playTrackUuid,
      },
    };
  }

  if (userSettings.autoselectPrimarySourceWithDefault() === AutoselectPrimarySource.Always) {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid,
        showUuid,
        sourceUuid: 'initial',
      },
    };
  } else {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/sources/`,
      params: {
        artistUuid,
        showUuid,
      },
    };
  }
}

export function ShowLink({ show, ...props }: { show: PushShowOptions } & Omit<LinkProps, 'href'>) {
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return <Link href={showHref(userSettings, groupSegment, show)} {...props} />;
}

export function usePushShowRespectingUserSettings() {
  const router = useRouter();
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return {
    pushShow(pushShowOptions: PushShowOptions, options?: NavigationOptions) {
      const href = showHref(userSettings, groupSegment, pushShowOptions);

      router.push(href, options);
    },
  };
}
