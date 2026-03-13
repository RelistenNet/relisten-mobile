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
import { useIsOfflineTab, useRoute } from '@/relisten/util/routes';
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

type YearListItemBaseProps = {
  isTrendingSort: boolean;
  nextRoute: string;
  year: Year;
};

const YearListItemLink = ({
  children,
  nextRoute,
  year,
}: Pick<YearListItemBaseProps, 'nextRoute' | 'year'> & { children: React.ReactNode }) => {
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
      <SectionedListItem>{children}</SectionedListItem>
    </Link>
  );
};

const YearListItemContents = ({
  hasOfflineTracks,
  isTrendingSort,
  shows,
  sources,
  year,
}: {
  hasOfflineTracks: boolean;
  isTrendingSort: boolean;
  shows: number | undefined;
  sources: number | undefined;
  year: Year;
}) => {
  return (
    <Flex cn="justify-between items-center" full>
      <Flex column cn="flex-1">
        <Flex cn="items-center justify-between">
          <RowTitle>{year.year}</RowTitle>
          <PopularityIndicator popularity={year.popularity} isTrendingSort={isTrendingSort} />
        </Flex>
        <SubtitleRow>
          <SubtitleText>
            <Plur word="show" count={shows} />
            {hasOfflineTracks && (
              <>
                &nbsp;
                <SourceTrackSucceededIndicator />
              </>
            )}
          </SubtitleText>
          <SubtitleText>
            <Plur word="tape" count={sources} />
          </SubtitleText>
        </SubtitleRow>
      </Flex>
    </Flex>
  );
};

const OfflineYearListItem = ({ isTrendingSort, nextRoute, year }: YearListItemBaseProps) => {
  const metadata = useYearMetadata(year);
  const hasOfflineTracks = year.hasOfflineTracks;

  return (
    <YearListItemLink nextRoute={nextRoute} year={year}>
      <YearListItemContents
        hasOfflineTracks={hasOfflineTracks}
        isTrendingSort={isTrendingSort}
        shows={metadata.shows}
        sources={metadata.sources}
        year={year}
      />
    </YearListItemLink>
  );
};

const YearListItem = ({ isTrendingSort, nextRoute, year }: YearListItemBaseProps) => {
  return (
    <YearListItemLink nextRoute={nextRoute} year={year}>
      <YearListItemContents
        hasOfflineTracks={year.hasOfflineTracks}
        isTrendingSort={isTrendingSort}
        shows={year.showCount}
        sources={year.sourceCount}
        year={year}
      />
    </YearListItemLink>
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
  const isOfflineTab = useIsOfflineTab();
  const nextRoute = useRoute('year/[yearUuid]');
  const { filters } = useFilters<YearFilterKey, Year>();
  const isTrendingSort = filters.some(
    (filter) => filter.active && filter.persistenceKey === YearFilterKey.Trending
  );
  const data = useMemo(() => {
    return [{ data: [...years] }];
  }, [years]);

  return (
    <FilterableList
      ListHeaderComponent={<YearsHeader artist={artist} />}
      data={data}
      renderItem={({ item: year }) => {
        if (isOfflineTab) {
          return (
            <OfflineYearListItem
              isTrendingSort={isTrendingSort}
              nextRoute={nextRoute}
              year={year}
            />
          );
        }

        return <YearListItem isTrendingSort={isTrendingSort} nextRoute={nextRoute} year={year} />;
      }}
      {...props}
    />
  );
};
