import { RelistenText } from '@/relisten/components/relisten_text';
import { Show } from '@/relisten/realm/models/show';
import { tw } from '@/relisten/util/tw';
import { Link } from 'expo-router';
import React, {
  LegacyRef,
  PropsWithChildren,
  ReactNode,
  RefAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { TouchableOpacity, View, ViewProps } from 'react-native';
import { assert } from 'realm/dist/assert';
import ContentLoader from 'react-content-loader';
import { List as ListContentLoader, Rect } from 'react-content-loader/native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import Plur from './plur';

export function ShowCardContainer({
  cn,
  className,
  children,
  innerRef = undefined,
  ...props
}: {
  cn?: string;
  className?: string;
  innerRef?: LegacyRef<View> | undefined;
} & ViewProps &
  PropsWithChildren) {
  return (
    <View
      className={tw('w-[168px] shrink pl-1 pr-1 first:pl-0 last:pr-0', cn, className)}
      ref={innerRef}
      {...props}
    >
      {children}
    </View>
  );
}

export interface ShowCardContentsProps {
  title: React.ReactNode;
  subtitle?: string;
  details?: ReadonlyArray<string>;
  textClassName?: string;
  innerRef?: LegacyRef<View> | undefined;
}
export function ShowCardTitle({
  children,
  textClassName,
}: {
  children: React.ReactNode;
  textClassName?: string;
}) {
  return (
    <RelistenText selectable={false} className={tw('text-md font-bold', textClassName)}>
      {children}
    </RelistenText>
  );
}

export function ShowCardContents({
  title,
  subtitle,
  details,
  className,
  textClassName,
  innerRef = undefined,
  ...props
}: ShowCardContentsProps & ViewProps) {
  return (
    <View className={tw('rounded-lg bg-gray-600 p-2', className)} ref={innerRef} {...props}>
      {title}
      {subtitle && (
        <RelistenText selectable={false} className={tw('pt-1', textClassName)}>
          {subtitle}
        </RelistenText>
      )}
      {(details || []).map((d, idx) => (
        <RelistenText
          numberOfLines={1}
          key={idx}
          selectable={false}
          className={tw('pt-1 text-xs', textClassName)}
        >
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

    const parts: string[] = [Plur({ word: 'tape', count: show.sourceCount })];

    if (show.hasSoundboardSource) {
      parts.push('SBD');
    }

    if (parts.length > 0) {
      details.push(parts.join(' • '));
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
            title={
              <View className="flex flex-row items-center justify-between">
                <ShowCardTitle>{show.displayDate}</ShowCardTitle>
                <RelistenText cn="text-xs">
                  {/* <Plur word={'Review'} count={source.reviewCount} /> */}
                  {show.avgRating ? ` ${show.humanizedAvgRating()}★` : ''}
                </RelistenText>
              </View>
            }
            subtitle={showArtist && show.artist?.name ? show.artist?.name : undefined}
            details={details}
          />
        </TouchableOpacity>
      </Link>
    </ShowCardContainer>
  );
}

export function ShowCardLoader({
  showArtist = true,
  showVenue = true,
  ...props
}: { showArtist: boolean; showVenue: boolean } & ViewProps) {
  const ref = useRef<View>(null);
  const outerRef = useRef<View>(null);
  const [contentsLayout, setContentsLayout] = useState<
    { width: number; height: number; left: number; top: number } | undefined
  >();

  useLayoutEffect(() => {
    if (!ref.current || !outerRef.current) {
      return;
    }

    const current = ref.current as unknown as any;
    const outerCurrent = outerRef.current as unknown as any;

    const bounds = current.unstable_getBoundingClientRect();
    const outerBounds = outerCurrent.unstable_getBoundingClientRect();
    const { width, height } = bounds;

    const newContentsLayout = {
      width,
      height,
      left: Math.floor(bounds.left - outerBounds.left),
      top: Math.floor(bounds.top - outerBounds.top),
    };

    setContentsLayout(newContentsLayout);
  }, [setContentsLayout]);

  return (
    <ShowCardContainer innerRef={outerRef} {...props}>
      <ShowCardContents
        title={<ShowCardTitle>Show loading...</ShowCardTitle>}
        subtitle={showArtist ? 'Artist loading' : undefined}
        details={
          showVenue
            ? ['Venue name loading...', 'Venue location loading...', 'Tapes loading...']
            : ['Venue loading...', 'Tapes loading...']
        }
        innerRef={ref}
        textClassName="opacity-0"
      />
      {contentsLayout && (
        <View
          className={`absolute left-[${contentsLayout.left}px] top-[${contentsLayout.top}px] p-1 pl-3`}
        >
          <ListContentLoader
            width={contentsLayout.width - 8}
            height={contentsLayout.height - 8}
            foregroundColor="rgb(160, 160, 160)"
            backgroundColor="rgb(130, 130, 130)"
            opacity={0.8}
          />
        </View>
      )}
    </ShowCardContainer>
  );
}
