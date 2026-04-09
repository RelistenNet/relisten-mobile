import { RelistenText } from '@/relisten/components/relisten_text';
import { Show } from '@/relisten/realm/models/show';
import { tw } from '@/relisten/util/tw';
import React, { LegacyRef, memo, PropsWithChildren, useState } from 'react';
import { LayoutChangeEvent, Pressable, useWindowDimensions, View, ViewProps } from 'react-native';
import { List as ListContentLoader } from 'react-content-loader/native';
import Plur from './plur';
import { ShowLink } from '@/relisten/util/push_show';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';

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
  const { fontScale } = useWindowDimensions();

  const width = Math.round(176 * fontScale);

  return (
    <View
      className={tw(`shrink pl-1 pr-1 first:pl-0 last:pr-0`, cn, className)}
      style={{ width }}
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
  footer?: React.ReactNode;
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
    <RelistenText selectable={false} className={tw('text-base font-semibold', textClassName)}>
      {children}
    </RelistenText>
  );
}

export function ShowCardContents({
  title,
  subtitle,
  details,
  footer,
  className,
  textClassName,
  innerRef = undefined,
  ...props
}: ShowCardContentsProps & ViewProps) {
  return (
    <View
      className={tw('rounded-xl border border-white/10 bg-slate-700/80 p-2 shadow-sm', className)}
      ref={innerRef}
      {...props}
    >
      {title}
      {subtitle && (
        <RelistenText
          selectable={false}
          className={tw('pt-0.5 text-sm text-gray-200', textClassName)}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {subtitle}
        </RelistenText>
      )}
      {(details || []).map((d, idx) => (
        <RelistenText
          numberOfLines={1}
          key={idx}
          selectable={false}
          className={tw('pt-0.5 text-xs text-gray-200', textClassName)}
        >
          {d}
        </RelistenText>
      ))}
      {footer}
    </View>
  );
}

function ShowCardMetaChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={tw('rounded-full bg-black/20 px-1.5 py-0.5', className)}>{children}</View>
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
      <ShowLink
        show={{
          artist: show.artist,
          showUuid: show.uuid,
          sourceUuid: sourceUuid,
          overrideGroupSegment: root === 'artists' ? '(artists)' : '(myLibrary)',
        }}
        asChild
      >
        <Pressable
          style={({ pressed }) => (pressed ? { transform: [{ scale: 0.975 }] } : undefined)}
        >
          {({ pressed }) => (
            <ShowCardContents
              className={pressed ? 'border-white/20 bg-slate-600/90 opacity-90' : undefined}
              title={
                <View className="flex flex-row items-center justify-between">
                  <ShowCardTitle>{show.displayDate}</ShowCardTitle>
                  <RelistenText cn="text-xs text-gray-200">
                    {/* <Plur word={'Review'} count={source.reviewCount} /> */}
                    {show.avgRating ? ` ${show.humanizedAvgRating()}★` : ''}
                  </RelistenText>
                </View>
              }
              subtitle={showArtist && show.artist?.name ? show.artist?.name : undefined}
              details={details}
              footer={
                <View className="flex-row items-center pt-1">
                  <View className="flex-1 flex-row items-center pr-2">
                    <ShowCardMetaChip>
                      <RelistenText
                        numberOfLines={1}
                        selectable={false}
                        className="text-xs text-gray-100"
                      >
                        <Plur word="tape" count={show.sourceCount} />
                      </RelistenText>
                    </ShowCardMetaChip>
                    {show.hasSoundboardSource ? (
                      <>
                        <View className="w-1" />
                        <ShowCardMetaChip>
                          <RelistenText
                            numberOfLines={1}
                            selectable={false}
                            className="text-xs font-semibold text-gray-100"
                          >
                            SBD
                          </RelistenText>
                        </ShowCardMetaChip>
                      </>
                    ) : null}
                  </View>
                  <View className="ml-auto items-end">
                    {show.popularity ? (
                      <ShowCardMetaChip>
                        <PopularityIndicator
                          popularity={show.popularity?.snapshot()}
                          isTrendingSort={false}
                          showIcon={false}
                          cn="items-center"
                        />
                      </ShowCardMetaChip>
                    ) : null}
                  </View>
                </View>
              }
            />
          )}
        </Pressable>
      </ShowLink>
    </ShowCardContainer>
  );
}

export function ShowCardLoader({
  showArtist = true,
  showVenue = true,
  ...props
}: { showArtist: boolean; showVenue: boolean } & ViewProps) {
  const [contentsLayout, setContentsLayout] = useState<
    { width: number; height: number; left: number; top: number } | undefined
  >();

  const onContentsLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const nextLayout = {
      width: layout.width,
      height: layout.height,
      left: Math.floor(layout.x),
      top: Math.floor(layout.y),
    };

    setContentsLayout((currentLayout) => {
      if (
        currentLayout &&
        currentLayout.width === nextLayout.width &&
        currentLayout.height === nextLayout.height &&
        currentLayout.left === nextLayout.left &&
        currentLayout.top === nextLayout.top
      ) {
        return currentLayout;
      }

      return nextLayout;
    });
  };

  return (
    <ShowCardContainer {...props}>
      <ShowCardContents
        title={
          <View className="flex flex-row items-center justify-between">
            <ShowCardTitle textClassName="opacity-0">Show loading...</ShowCardTitle>
            <RelistenText cn="text-xs text-gray-200 opacity-0">0.0★</RelistenText>
          </View>
        }
        subtitle={showArtist ? 'Artist loading' : undefined}
        details={
          showVenue ? ['Venue name loading...', 'Venue location loading...'] : ['Venue loading...']
        }
        footer={
          <View className="flex-row items-center pt-1 opacity-0">
            <View className="flex-1 flex-row items-center pr-2">
              <ShowCardMetaChip className="mr-1">
                <RelistenText
                  numberOfLines={1}
                  selectable={false}
                  className="text-xs text-gray-100"
                >
                  99 tapes
                </RelistenText>
              </ShowCardMetaChip>
              <View className="w-1" />
              <ShowCardMetaChip>
                <RelistenText
                  numberOfLines={1}
                  selectable={false}
                  className="text-xs font-semibold text-gray-100"
                >
                  SBD
                </RelistenText>
              </ShowCardMetaChip>
            </View>
            <View className="ml-auto items-end">
              <ShowCardMetaChip>
                <RelistenText
                  numberOfLines={1}
                  selectable={false}
                  className="text-xs text-gray-100"
                >
                  0.0k 30d
                </RelistenText>
              </ShowCardMetaChip>
            </View>
          </View>
        }
        onLayout={onContentsLayout}
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

export const ShowCardStandbyTray = memo(function ShowCardStandbyTray({
  showArtist,
  showVenue,
}: {
  showArtist: boolean;
  showVenue: boolean;
}) {
  return (
    <View className="overflow-hidden pb-2 pl-3">
      <View className="flex-row">
        <ShowCardLoader showArtist={showArtist} showVenue={showVenue} />
      </View>
    </View>
  );
});
