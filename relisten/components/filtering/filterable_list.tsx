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

const logger = log.extend('filter');

export type FilterableListProps<T extends RelistenObject> = {
  data: RelistenSectionData<T>;
  hideFilterBar?: boolean;
  filtering?: boolean;
} & RelistenSectionListProps<T>;

const ALL_SECTION_SENTINEL = '__ALL__';

export const FilterableList = <K extends string, T extends RelistenObject>({
  data,
  hideFilterBar,
  filtering,
  ...props
}: FilterableListProps<T>) => {
  const { filters, onFilterButtonPress, filter } = useFilters<K, T>();

  const filteringEnabled = filtering !== undefined ? filtering : true;

  if (!filteringEnabled) {
    hideFilterBar = true;
  }

  const sectionedData = useMemo(() => {
    return [
      { sectionTitle: ALL_SECTION_SENTINEL, data: [] },
      ...data.map((section) => {
        const filteredData = filteringEnabled ? filter(section.data) : section.data;

        return { ...section, data: filteredData };
      }),
    ];
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
      renderSectionHeader={({ sectionTitle }) => {
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

        return <SectionHeader title={sectionTitle} />;
      }}
    />
  );
};
