import { TouchableOpacity, TouchableOpacityProps, View, ViewProps } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Link, router } from 'expo-router';
import React, { PropsWithChildren, ReactNode } from 'react';
import { Source } from '@/relisten/realm/models/source';
import { useGroupSegment } from '@/relisten/util/routes';
import dayjs from 'dayjs';
import { Link as SLink } from '@/relisten/api/models/source';
import { openBrowserAsync } from 'expo-web-browser';
import { RelistenLink } from '@/relisten/components/relisten_link';
import { tw } from '@/relisten/util/tw';
import { Show } from '@/relisten/realm/models/show';
import { RelistenButton } from '@/relisten/components/relisten_button';
import Plur from '@/relisten/components/plur';

export const SourceProperty: React.FC<
  PropsWithChildren<{ title: string; value?: string; onTitlePress?: () => void }>
> = ({ title, value, children, onTitlePress }) => {
  const titleComponent = (
    <RelistenText className="pb-1 text-sm font-bold text-gray-400">
      {title}
      {onTitlePress && <>&nbsp;›</>}
    </RelistenText>
  );

  return (
    <View className="w-full flex-1 flex-col py-1">
      {onTitlePress ? (
        <TouchableOpacity onPress={onTitlePress} hitSlop={16}>
          {titleComponent}
        </TouchableOpacity>
      ) : (
        titleComponent
      )}
      {value ? (
        <RelistenText className="bg w-full grow" selectable={true}>
          {value}
        </RelistenText>
      ) : (
        <View className="bg w-full grow">{children}</View>
      )}
    </View>
  );
};

function SourceDetailsLine({
  title,
  children,
  ...props
}: PropsWithChildren<{ title: ReactNode } & ViewProps>) {
  return (
    <View className="w-full" {...props}>
      <RelistenText selectable={false}>
        <RelistenText className="font-bold">{title}:</RelistenText> {children}
      </RelistenText>
    </View>
  );
}

export function SourceReviewsButton({ show, source }: { show: Show; source: Source }) {
  const groupSegment = useGroupSegment(true);

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/reviews`,
        params: {
          artistUuid: show.artistUuid,
          showUuid: show.uuid,
          sourceUuid: source.uuid,
        },
      }}
      asChild
      className="flex-1"
    >
      <RelistenButton textClassName="text-l" icon={null} disabled={source.reviewCount < 1}>
        <Plur word={'Review'} count={source.reviewCount} />
        {source.avgRating ? `\u00A0•\u00A0${source.avgRating.toFixed(1)}★` : ''}
      </RelistenButton>
    </Link>
  );
}

export function SourceSummary({
  source,
  children,
  className,
  ...props
}: PropsWithChildren<
  {
    source: Source;
  } & ViewProps
>) {
  return (
    <View className={tw('flex w-full flex-col py-4 pb-3', className)} {...props}>
      {source.taper && (
        <SourceDetailsLine title="Taper" className="mb-1">
          {source.taper}
        </SourceDetailsLine>
      )}
      {source.transferrer && (
        <SourceDetailsLine title="Transferrer" className="mb-1">
          {source.transferrer}
        </SourceDetailsLine>
      )}
      {source.source && (
        <SourceDetailsLine title="Source" className="mb-1">
          {source.source}
        </SourceDetailsLine>
      )}
      {source.lineage && (
        <SourceDetailsLine title="Lineage" className="mb-1">
          {source.lineage}
        </SourceDetailsLine>
      )}
      {children}
    </View>
  );
}

export const SourceFooter: React.FC<{ source: Source }> = ({ source }) => {
  return (
    <View className="px-4 py-4">
      <RelistenText className="text-l py-1 text-gray-400">
        Source last updated: {dayjs(source.updatedAt).format('YYYY-MM-DD')}
      </RelistenText>
      <RelistenText className="text-l py-1 text-gray-400">
        Identifier: {source.upstreamIdentifier}
      </RelistenText>
      {source.links().map((l) => (
        <SourceLink key={l.upstream_source_id} className="py-1" link={l} />
      ))}
    </View>
  );
};
export const SourceLink = ({ link, ...props }: { link: SLink } & TouchableOpacityProps) => {
  return (
    <TouchableOpacity onPress={() => openBrowserAsync(link.url)} {...props}>
      <RelistenLink className="text-l font-bold text-gray-400">{link.label}</RelistenLink>
    </TouchableOpacity>
  );
};
