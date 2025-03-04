import { RelistenText } from '@/relisten/components/relisten_text';
import { Show } from '@/relisten/realm/models/show';
import { tw } from '@/relisten/util/tw';
import { Link } from 'expo-router';
import React, { PropsWithChildren, useLayoutEffect, useRef } from 'react';
import { TouchableOpacity, View, ViewProps } from 'react-native';

export function ShowCardContainer({
  cn,
  className,
  children,
  ...props
}: {
  cn?: string;
  className?: string;
} & ViewProps &
  PropsWithChildren) {
  return (
    <View className={tw('shrink pl-1 pr-1 first:pr-0 last:pr-0', cn, className)} {...props}>
      {children}
    </View>
  );
}

export interface ShowCardContentsProps {
  title: string;
  subtitle?: string;
  details?: ReadonlyArray<string>;
}

export function ShowCardContents({ title, subtitle, details }: ShowCardContentsProps & ViewProps) {
  return (
    <View className="rounded-lg bg-gray-600 p-2">
      <RelistenText selectable={false} className="text-md font-bold">
        {title}
      </RelistenText>
      {subtitle && (
        <RelistenText selectable={false} className="pt-1">
          {subtitle}
        </RelistenText>
      )}
      {(details || []).map((d, idx) => (
        <RelistenText numberOfLines={1} key={idx} selectable={false} className="pt-1 text-xs">
          {d}
        </RelistenText>
      ))}
    </View>
  );
}

export function ShowCard({
  show,
  sourceUuid,
  root,
  showArtist = true,
  ...props
}: {
  show: Show;
  sourceUuid?: string;
  root?: 'artists' | 'myLibrary';
  showArtist?: boolean;
} & ViewProps) {
  const details: string[] = [];

  if (show.venue) {
    if (show.venue.name) {
      details.push(show.venue.name.trim());
    }

    if (show.venue.location) {
      details.push(show.venue.location.trim());
    }
  } else {
    details.push('Venue Unknown');
  }

  return (
    <ShowCardContainer {...props}>
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
          <ShowCardContents
            title={show.displayDate}
            subtitle={showArtist && show.artist?.name ? show.artist?.name : undefined}
            details={details}
          />
        </TouchableOpacity>
      </Link>
    </ShowCardContainer>
  );
}

export function useShowCardHeight() {
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
}

export function ShowCardLoader({
  showArtist = true,
  showVenue = true,
  ...props
}: { showArtist: boolean; showVenue: boolean } & ViewProps) {
  return (
    <ShowCardContainer {...props}>
      <ShowCardContents
        title="Show loading..."
        subtitle={showArtist ? 'Artist loading' : undefined}
        details={
          showVenue ? ['Venue name loading...', 'Venue location loading...'] : ['Venue loading...']
        }
      />
    </ShowCardContainer>
  );
}
