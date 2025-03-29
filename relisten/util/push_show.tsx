import { Href, Link, LinkProps, Redirect, useRouter } from 'expo-router';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { RelistenTabGroupSegment, useGroupSegment } from '@/relisten/util/routes';
import { AutoselectPrimarySource, UserSettings } from '@/relisten/realm/models/user_settings';
import { NavigationOptions } from 'expo-router/build/global-state/routing';
import { useMemo } from 'react';
import { useArtist, useArtists } from '@/relisten/realm/models/artist_repo';
import { Artist } from '@/relisten/realm/models/artist';

export interface PushShowOptions {
  artist: Artist;
  showUuid: string;
  sourceUuid?: string;
  playTrackUuid?: string;

  overrideGroupSegment?: RelistenTabGroupSegment;
}

function showHref(
  userSettings: UserSettings,
  groupSegment: RelistenTabGroupSegment,
  hasMultipleSources: boolean,
  { artist, showUuid, sourceUuid, playTrackUuid, overrideGroupSegment }: PushShowOptions
): Href {
  const effectiveGroupSegement = overrideGroupSegment ?? groupSegment;

  // if a specific source is specified, go right to it
  if (sourceUuid && sourceUuid !== 'initial') {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid: artist.uuid,
        showUuid,
        sourceUuid,
        playTrackUuid,
      },
    };
  }

  if (
    !hasMultipleSources ||
    userSettings.autoselectPrimarySourceWithDefault() === AutoselectPrimarySource.Always
  ) {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid: artist.uuid,
        showUuid,
        sourceUuid: 'initial',
      },
    };
  } else {
    return {
      pathname: `/relisten/tabs/${effectiveGroupSegement}/[artistUuid]/show/[showUuid]/sources/`,
      params: {
        artistUuid: artist.uuid,
        showUuid,
      },
    };
  }
}

export function ShowLink({ show, ...props }: { show: PushShowOptions } & Omit<LinkProps, 'href'>) {
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return (
    <Link
      href={showHref(userSettings, groupSegment, show.artist.features().multiple_sources, show)}
      {...props}
    />
  );
}

export function ShowRedirect({
  show,
  ...props
}: { show: PushShowOptions } & Omit<LinkProps, 'href'>) {
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return (
    <Redirect
      href={showHref(userSettings, groupSegment, show.artist.features().multiple_sources, show)}
      {...props}
    />
  );
}

export function usePushShowRespectingUserSettings() {
  const router = useRouter();
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return {
    pushShow(pushShowOptions: PushShowOptions, options?: NavigationOptions) {
      const href = showHref(
        userSettings,
        groupSegment,
        pushShowOptions.artist.features().multiple_sources,
        pushShowOptions
      );

      router.push(href, options);
    },
  };
}
