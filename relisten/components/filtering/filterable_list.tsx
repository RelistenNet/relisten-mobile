import { log } from '@/relisten/util/logging';
import { useMemo } from 'react';
import { RelistenObject } from '../../api/models/relisten';
import {
  RelistenSectionData,
  RelistenSectionList,
  RelistenSectionListProps,
} from '../relisten_section_list';
import { SectionHeader } from '../section_header';
import { FilterBar } from './filter_bar';
import { FilterBarButton } from './filter_bar_buttons';
import { Filter, SortDirection, useFilters } from './filters';
import { NonIdealState } from '../non_ideal_state';
import { RelistenText } from '../relisten_text';
import Plur from '../plur';
import { useRefreshContext } from '../refresh_context';

const logger = log.extend('filter');

export type FilterableListProps<T extends RelistenObject> = {
  data: RelistenSectionData<T>;
  hideFilterBar?: boolean;
  filtering?: boolean;
} & RelistenSectionListProps<T>;

const ALL_SECTION_SENTINEL = '__ALL__';
const EMPTY_SECTION_SENTINEL = '__EMPTY__';
const FILTER_WARNING_SECTION_SENTINEL = '__FILTER_WARNING__';
const HIDDEN_SECTION_SENTINEL = '__HIDDEN__';

export const FilterableList = <K extends string, T extends RelistenObject>({
  data,
  hideFilterBar,
  filtering,
  ...props
}: FilterableListProps<T>) => {
  const { filters, onFilterButtonPress, filter, clearFilters } = useFilters<K, T>();
  const filteringEnabled = filtering !== undefined ? filtering : true;

  if (!filteringEnabled) {
    hideFilterBar = true;
  }

  const sectionedData = useMemo(() => {
    const filteredData = data.map((section) => {
      const filteredData = filteringEnabled ? filter(section.data) : section.data;
      const itemsHidden = section.data.length - filteredData.length;

      return { ...section, data: filteredData, itemsHidden };
    });
    const noDataIsVisible = filteredData.filter((x) => x.data.length > 0).length === 0;
    const itemsHidden = filteredData.reduce((memo, next) => memo + next.itemsHidden, 0);

    return [
      { sectionTitle: ALL_SECTION_SENTINEL, data: [] },
      ...filteredData.filter((f) => f.data.length > 0),
      noDataIsVisible
        ? { sectionTitle: EMPTY_SECTION_SENTINEL, data: [], metadata: itemsHidden }
        : { sectionTitle: HIDDEN_SECTION_SENTINEL, data: [] },
      !noDataIsVisible && itemsHidden > 0
        ? { sectionTitle: FILTER_WARNING_SECTION_SENTINEL, data: [], metadata: itemsHidden }
        : { sectionTitle: HIDDEN_SECTION_SENTINEL, data: [] },
    ].filter((x) => x);
  }, [data, filter, filters, filteringEnabled]);

  function filterToString<K extends string, T>(f: Filter<K, T>) {
    return `${f.title}${f.active ? '*' : ''}${
      f.sortDirection !== undefined
        ? f.sortDirection === SortDirection.Descending
          ? ' desc'
          : ' asc'
        : ''
    }`;
  }

  logger.debug(filters.map(filterToString).join('; '));

  return (
    <RelistenSectionList
      data={sectionedData}
      pullToRefresh
      {...props}
      renderSectionHeader={({ sectionTitle, ...props }) => {
        if (sectionTitle === ALL_SECTION_SENTINEL) {
          if (hideFilterBar) {
            return <></>;
          }

          return (
            <SectionHeader className="p-0 pt-3">
              <FilterBar>
                {filters.map((f) => {
                  return (
                    <FilterBarButton
                      key={f.persistenceKey}
                      filter={f}
                      onPress={() => onFilterButtonPress(f)}
                    />
                  );
                })}
              </FilterBar>
            </SectionHeader>
          );
        }

        if (sectionTitle === EMPTY_SECTION_SENTINEL) {
          if (props.metadata && props.metadata > 0) {
            return (
              <NonIdealState
                title="No Results"
                description={
                  <>
                    Your filters are hiding <Plur count={props.metadata} word="item" />, tap below
                    to clear them
                  </>
                }
                actionText="Remove Filters"
                onAction={clearFilters}
              />
            );
          } else {
            return (
              <NonIdealState
                title="No Results"
                description="No data loaded, please refresh or adjust your filters."
              />
            );
          }
        }

        if (sectionTitle === FILTER_WARNING_SECTION_SENTINEL) {
          return (
            <RelistenText cn="py-2 italic text-sm px-4 text-gray-400 text-center">
              (<Plur count={props.metadata} word="item" /> hidden due to filters)
            </RelistenText>
          );
        }

        if (sectionTitle === HIDDEN_SECTION_SENTINEL) {
          return <></>;
        }

        return <SectionHeader title={sectionTitle} />;
      }}
    />
  );
};
