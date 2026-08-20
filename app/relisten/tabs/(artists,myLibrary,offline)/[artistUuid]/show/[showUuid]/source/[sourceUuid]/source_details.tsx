import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, ScrollViewProps, useWindowDimensions, View } from 'react-native';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useFullShowWithSelectedSource } from '@/relisten/realm/models/show_repo';
import { RelistenText } from '@/relisten/components/relisten_text';
import RenderHtml from 'react-native-render-html';
import { Source } from '@/relisten/realm/models/source';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { SourceFooter, SourceProperty } from '@/relisten/components/source/source_components';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { useRealm } from '@/relisten/realm/schema';
import { useGroupSegment } from '@/relisten/util/routes';
import { Show } from '@/relisten/realm/models/show';
import {
  activeCatalogObjectForPrimaryKey,
  retainedCatalogObjectForPrimaryKey,
  readRetainedCatalogObject,
} from '@/relisten/realm/catalog_retirement';

function SourceDetails({ source, ...props }: { source: Source } & ScrollViewProps) {
  const { width } = useWindowDimensions();

  return (
    <ScrollView className="w-full flex-1 flex-col py-4" {...props}>
      <View className="w-full flex-1 flex-col px-4">
        {source.taper && (
          <View className="mb-2">
            <SourceProperty title="Taper">
              <RelistenText numberOfLines={undefined} selectable={true}>
                {source.taper}
              </RelistenText>
            </SourceProperty>
          </View>
        )}
        {source.transferrer && (
          <View className="mb-2">
            <SourceProperty title="Transferrer">
              <RelistenText numberOfLines={undefined} selectable={true}>
                {source.transferrer}
              </RelistenText>
            </SourceProperty>
          </View>
        )}
        {source.source && (
          <View className="mb-2">
            <SourceProperty title="Source">
              <RelistenText numberOfLines={undefined} selectable={true}>
                {source.source}
              </RelistenText>
            </SourceProperty>
          </View>
        )}
        {source.lineage && (
          <View className="mb-2">
            <SourceProperty title="Lineage">
              <RelistenText numberOfLines={undefined} selectable={true}>
                {source.lineage}
              </RelistenText>
            </SourceProperty>
          </View>
        )}
        {source.taperNotes && (
          <View className="mb-2">
            <SourceProperty title="Taper Notes">
              <RelistenText numberOfLines={undefined} selectable={true}>
                {source.taperNotes}
              </RelistenText>
            </SourceProperty>
          </View>
        )}
        {source.description && (
          <View className="mb-2">
            <SourceProperty title="Description">
              <RenderHtml
                contentWidth={width - 32}
                source={{ html: source.description }}
                enableCSSInlineProcessing={false}
                baseStyle={{ color: 'white', whiteSpace: 'pre' }}
              />
            </SourceProperty>
          </View>
        )}
      </View>
      <View className="pb-4">
        <SourceFooter source={source} />
      </View>
    </ScrollView>
  );
}

export default function Page() {
  const realm = useRealm();
  const navigation = useNavigation();
  const { showUuid, sourceUuid } = useLocalSearchParams();
  const groupSegment = useGroupSegment();
  const playerBottomScrollViewProps = usePlayerBottomScrollViewProps();

  const {
    results: { isNetworkLoading },
    show: queriedShow,
    selectedSource: queriedSource,
  } = useFullShowWithSelectedSource(String(showUuid), String(sourceUuid));
  const retainedAccessSite =
    groupSegment === '(offline)'
      ? 'offline.source-details'
      : groupSegment === '(myLibrary)'
        ? 'library.source-details'
        : undefined;
  const show = retainedAccessSite
    ? (retainedCatalogObjectForPrimaryKey(
        realm,
        Show,
        String(showUuid),
        `${retainedAccessSite}.show`
      ) ?? readRetainedCatalogObject(queriedShow, `${retainedAccessSite}.show-fallback`))
    : queriedShow;
  const source = retainedAccessSite
    ? (retainedCatalogObjectForPrimaryKey(
        realm,
        Source,
        String(sourceUuid),
        `${retainedAccessSite}.source`
      ) ?? readRetainedCatalogObject(queriedSource, `${retainedAccessSite}.source-fallback`))
    : String(sourceUuid) === 'initial'
      ? queriedSource
      : activeCatalogObjectForPrimaryKey(
          realm,
          Source,
          String(sourceUuid),
          'artists.source-details.source'
        );

  useEffect(() => {
    navigation.setOptions({ title: show ? `${show.displayDate} Details` : 'Details' });
  }, [navigation, show]);

  if (isNetworkLoading || !source) {
    return (
      <View className="w-full p-4">
        <ListContentLoader
          backgroundColor={RelistenBlue[800]}
          foregroundColor={RelistenBlue[700]}
        />
      </View>
    );
  }

  return (
    <ScrollScreen>
      <SourceDetails source={source} {...playerBottomScrollViewProps} />
    </ScrollScreen>
  );
}
