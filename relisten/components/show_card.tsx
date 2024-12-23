import { RelistenText } from '@/relisten/components/relisten_text';
import { Show } from '@/relisten/realm/models/show';
import { tw } from '@/relisten/util/tw';
import { Link } from 'expo-router';
import React, { useLayoutEffect, useRef } from 'react';
import { TouchableOpacity, View, ViewProps } from 'react-native';

export function ShowCard({
  show,
  sourceUuid,
  root,
  cn,
  showArtist = true,
  className,
  ...props
}: {
  show: Show;
  sourceUuid?: string;
  root?: 'artists' | 'myLibrary';
  cn?: string;
  className?: string;
  showArtist?: boolean;
} & ViewProps) {
  const ref = useRef<any>(null);

  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    console.log(ref.current.unstable_getBoundingClientRect());
    const { width, height } = ref.current.unstable_getBoundingClientRect();
    // or unstable_getBoundingClientRect()
    console.log('The view measures %sx%s', width, height);
  }, []);

  return (
    <View
      className={tw('shrink pl-1 pr-1 first:pr-0 last:pr-0', cn, className)}
      {...props}
      ref={ref}
    >
      <Link
        href={{
          pathname:
            root === 'artists'
              ? '/relisten/tabs/(artists)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/'
              : '/relisten/tabs/(myLibrary)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
          params: {
            artistUuid: show.artistUuid,
            showUuid: show.uuid,
            sourceUuid: sourceUuid ?? 'initial',
          },
        }}
        asChild
      >
        <TouchableOpacity>
          <View className="rounded-lg bg-gray-600 p-2">
            <RelistenText selectable={false} className="text-md font-bold">
              {show.displayDate}
            </RelistenText>
            {showArtist && show.artist?.name && (
              <RelistenText selectable={false} className="pt-1">
                {show.artist?.name}
              </RelistenText>
            )}
            {show.venue ? (
              <>
                {show.venue?.name && (
                  <RelistenText numberOfLines={1} selectable={false} className="pt-1 text-xs">
                    {show.venue?.name?.trim()}
                  </RelistenText>
                )}
                {show.venue?.location && (
                  <RelistenText numberOfLines={1} selectable={false} className="pt-1 text-xs">
                    {show.venue?.location?.trim()}
                  </RelistenText>
                )}
              </>
            ) : (
              <RelistenText numberOfLines={1} selectable={false} className="pt-1 text-xs">
                Venue Unknown
              </RelistenText>
            )}
          </View>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
