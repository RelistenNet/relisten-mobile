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
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

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
  const navigation = useNavigation();
  const { showUuid, sourceUuid } = useLocalSearchParams();
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  const {
    results: { isNetworkLoading },
    show,
    selectedSource: source,
  } = useFullShowWithSelectedSource(String(showUuid), String(sourceUuid));

  useEffect(() => {
    navigation.setOptions({ title: show ? `${show.displayDate} Details` : 'Details' });
  }, [show]);

  if (isNetworkLoading) {
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
      <SourceDetails source={source} scrollIndicatorInsets={{ bottom: playerBottomBarHeight }} />
    </ScrollScreen>
  );
}
