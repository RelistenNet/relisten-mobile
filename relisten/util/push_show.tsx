import { Link, LinkProps, useRouter } from 'expo-router';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { RelistenTabGroupSegment, useGroupSegment } from "@/relisten/util/routes";
import { AutoselectPrimarySource, UserSettings } from "@/relisten/realm/models/user_settings";

export interface PushShowOptions {
  artistUuid: string;
  showUuid: string;
  sourceUuid?: string;
}

function showHref(userSettings: UserSettings, groupSegment: RelistenTabGroupSegment, { artistUuid, showUuid, sourceUuid }: PushShowOptions) {
  // if a specific source is specified, go right to it
  if (sourceUuid && sourceUuid !== 'initial') {
    return {
      pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid,
        showUuid,
        sourceUuid,
      },
    };
  }

  if (userSettings.autoselectPrimarySourceWithDefault() === AutoselectPrimarySource.Always) {
    return {
      pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
      params: {
        artistUuid,
        showUuid,
        sourceUuid: 'initial',
      },
    };
  } else {
    return {
      pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/sources/`,
      params: {
        artistUuid,
        showUuid,
      },
    };
  }
}

export function ShowLink({
  artistUuid,
  showUuid,
  sourceUuid,
  ...props
}: PushShowOptions & LinkProps) {
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();
  const href = showHref(userSettings, groupSegment, { artistUuid, showUuid, sourceUuid });

  return <Link href={href} />;
}

export function usePushShowRespectingUserSettings() {
  const router = useRouter();
  const userSettings = useUserSettings();
  const groupSegment = useGroupSegment();

  return {
    pushShow(pushShowOptions: PushShowOptions) {
      const href = showHref(userSettings, groupSegment, pushShowOptions);

      router.push(href);
    }
  }
}
