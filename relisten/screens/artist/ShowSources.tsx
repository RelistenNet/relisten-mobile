import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AllArtistsTabStackParams } from '../Artist';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useFullShow } from '../../realm/models/show_repo';
import { RelistenFlatList } from '../../components/relisten_flat_list';
import { memo } from '../../util/memo';
import { RefreshContextProvider } from '../../components/refresh_context';
import { Source } from '../../realm/models/source';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistShowSources'>;

export const ShowSourcesScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const navigation = useNavigation();
  const results = useFullShow(route.params.showUuid);
  const {
    data: { show, sources },
  } = results;

  useEffect(() => {
    if (show) {
      navigation.setOptions({ title: show.displayDate });
    } else {
      navigation.setOptions({ title: 'Show' });
    }
  }, [show]);

  const sortedSources = useMemo(() => {
    const all = [...sources];

    return all.sort((a, b) => b.avgRatingWeighted - a.avgRatingWeighted);
  }, [sources]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <RelistenFlatList
        style={{ flex: 1, width: '100%' }}
        data={sortedSources}
        renderItem={({ item: source, index }) => (
          <SourceListItem source={source} index={index} key={index} />
        )}
      />
    </RefreshContextProvider>
  );
};

const SourceProperty: React.FC<PropsWithChildren<{ title: string; value?: string }>> = ({
  title,
  value,
  children,
}) => {
  return (
    <View className="w-full flex-1 flex-row py-1">
      <Text className="basis-1/4 pt-0.5 text-sm text-slate-800">{title}</Text>
      {value ? (
        <Text className="bg w-0 grow text-base" selectable={true}>
          {value}
        </Text>
      ) : (
        children
      )}
    </View>
  );
};

export const SourceListItem: React.FC<PropsWithChildren<{ source: Source; index: number }>> = memo(
  ({ source, index }) => {
    return (
      <View className="w-full flex-1 flex-col bg-white px-4 py-4">
        <Text className="pb-1 text-sm font-bold">
          Source {index + 1}{' '}
          {source.duration && '— ' + dayjs.duration(source.duration, 'seconds').format('HH:mm:ss')}
        </Text>
        <SourceProperty
          title="Rating"
          // value={source.avgRating + ''}
          value={`${Math.round((source.avgRating + Number.EPSILON) * 100) / 100} (${
            source.numRatings
          } ratings)`}
        />
        {source.taper && <SourceProperty title="Taper" value={source.taper} />}
        {source.transferrer && <SourceProperty title="Transferrer" value={source.transferrer} />}
        {source.source && <SourceProperty title="Source" value={source.source} />}
        {source.lineage && <SourceProperty title="Lineage" value={source.lineage} />}
      </View>
    );
  }
);
