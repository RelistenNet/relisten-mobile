import {
  FilteringOptions,
  FilteringProvider,
  useFilters,
} from '@/relisten/components/filtering/filters';
import { useMemo } from 'react';
import { Artist } from '@/relisten/realm/models/artist';
import Realm from 'realm';
import { Year } from '@/relisten/realm/models/year';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { useRoute } from '@/relisten/util/routes';
import { useYearMetadata } from '@/relisten/realm/models/year_repo';
import { Link } from 'expo-router';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import Flex from '@/relisten/components/flex';
import RowTitle from '@/relisten/components/row_title';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import Plur from '@/relisten/components/plur';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { YEAR_FILTERS, YearFilterKey } from '@/relisten/pages/artist/years_filters';
import { YearsHeader } from '@/relisten/pages/artist/years_header';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';

const YearListItem = ({ year }: { year: Year }) => {
  const nextRoute = useRoute('year/[yearUuid]');
  const metadata = useYearMetadata(year);
  const hasOfflineTracks = year.hasOfflineTracks;
  const { filters } = useFilters<YearFilterKey, Year>();
  const isTrendingSort = filters.some(
    (filter) => filter.active && filter.persistenceKey === YearFilterKey.Trending
  );

  return (
    <Link
      href={{
        pathname: nextRoute,
        params: {
          artistUuid: year.artistUuid,
          yearUuid: year.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex cn="justify-between items-center" full>
          <Flex column cn="flex-1">
            <Flex cn="items-center justify-between">
              <RowTitle>{year.year}</RowTitle>
              <PopularityIndicator popularity={year.popularity} isTrendingSort={isTrendingSort} />
            </Flex>
            <SubtitleRow>
              <SubtitleText>
                <Plur word="show" count={metadata.shows} />
                {hasOfflineTracks && (
                  <>
                    &nbsp;
                    <SourceTrackSucceededIndicator />
                  </>
                )}
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

type YearsListProps = {
  artist: Artist | null;
  years: Realm.Results<Year>;
  filterOptions: FilteringOptions<YearFilterKey>;
} & Omit<FilterableListProps<Year>, 'data' | 'renderItem'>;

export const YearsListContainer = (props: YearsListProps) => {
  return (
    <FilteringProvider filters={YEAR_FILTERS} options={props.filterOptions}>
      <YearsList {...props} />
    </FilteringProvider>
  );
};

const YearsList = ({ artist, years, ...props }: YearsListProps) => {
  const data = useMemo(() => {
    return [{ data: [...years] }];
  }, [years]);

  return (
    <FilterableList
      ListHeaderComponent={<YearsHeader artist={artist} />}
      data={data}
      renderItem={({ item: year }) => {
        return <YearListItem year={year} />;
      }}
      {...props}
    />
  );
};
