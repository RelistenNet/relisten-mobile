import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { router } from 'expo-router';
import React, { PropsWithChildren } from 'react';
import { Source } from '@/relisten/realm/models/source';
import { useGroupSegment } from '@/relisten/util/routes';
import dayjs from 'dayjs';
import { Link as SLink } from '@/relisten/api/models/source';
import { openBrowserAsync } from 'expo-web-browser';
import { RelistenLink } from '@/relisten/components/relisten_link';

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

export function SourceSummary({
  source,
  hideExtraDetails,
}: {
  source: Source;
  hideExtraDetails?: boolean;
}) {
  const groupSegment = useGroupSegment();

  const navigate = () => {
    router.push({
      pathname:
        `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/source_details` as const,
      params: {
        artistUuid: source.artistUuid,
        showUuid: source.showUuid,
        sourceUuid: source.uuid,
      },
    });
  };

  return (
    <View className="w-full py-4">
      {source.taper && (
        <SourceProperty title="Taper" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.taper}
          </RelistenText>
        </SourceProperty>
      )}
      {source.transferrer && (
        <SourceProperty title="Transferrer" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.transferrer}
          </RelistenText>
        </SourceProperty>
      )}
      {source.source && (
        <SourceProperty title="Source" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.source}
          </RelistenText>
        </SourceProperty>
      )}
      {!hideExtraDetails && source.lineage && (
        <SourceProperty title="Lineage" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.lineage}
          </RelistenText>
        </SourceProperty>
      )}
      {!hideExtraDetails && source.taperNotes && (
        <SourceProperty title="Taper Notes" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.taperNotes}
          </RelistenText>
        </SourceProperty>
      )}
      {!hideExtraDetails && source.description && (
        <SourceProperty title="Description" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.description}
          </RelistenText>
        </SourceProperty>
      )}
      {!hideExtraDetails && source.duration && (
        <SourceProperty title="Duration" onTitlePress={navigate}>
          <RelistenText numberOfLines={2} selectable={false}>
            {source.humanizedDuration()}
          </RelistenText>
        </SourceProperty>
      )}
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
