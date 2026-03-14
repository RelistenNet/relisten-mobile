import { log } from '@/relisten/util/logging';
import React, { useEffect, useMemo } from 'react';
import { RelistenObject } from '../../api/models/relisten';
import {
  RelistenSectionData,
  RelistenSectionList,
  RelistenSectionListProps,
} from '../relisten_section_list';
import { SectionHeader } from '../section_header';
import { FilterBar } from './filter_bar';
import { FilterControl, SortDirection, useFilters } from './filters';
import { NonIdealState } from '../non_ideal_state';
import { RelistenText } from '../relisten_text';
import Plur from '../plur';
import { View } from 'react-native';
import { RelistenButton } from '../relisten_button';

const logger = log.extend('filter');

export type FilterableListProps<T extends RelistenObject> = {
  data: RelistenSectionData<T>;
  isLoading?: boolean;
  hideFilterBar?: boolean;
  filtering?: boolean;
  nonIdealState?: {
    filtered?: {
      title?: React.ReactNode;
      description?: React.ReactNode;
      actionText?: string;
    };
    noData?: {
      title?: React.ReactNode;
      description?: React.ReactNode;
    };
  };
} & RelistenSectionListProps<T>;

const ALL_SECTION_SENTINEL = '__ALL__';
const EMPTY_SECTION_SENTINEL = '__EMPTY__';
const FILTER_WARNING_SECTION_SENTINEL = '__FILTER_WARNING__';
const HIDDEN_SECTION_SENTINEL = '__HIDDEN__';
type SectionHeaderProps<T extends RelistenObject> = Parameters<
  NonNullable<RelistenSectionListProps<T>['renderSectionHeader']>
>[0];

export const FilterableList = <K extends string, T extends RelistenObject>(
  filterableListProps: FilterableListProps<T>
) => {
  const { data, isLoading, hideFilterBar, filtering, nonIdealState, ...props } =
    filterableListProps;
  const { filters, filter, clearFilters, searchText } = useFilters<K, T>();
  const filteringEnabled = filtering !== undefined ? filtering : true;
  const shouldHideFilterBar = !filteringEnabled || hideFilterBar;

  const sectionedData = useMemo(() => {
    const filteredData = data.map((section) => {
      const filteredData = filteringEnabled ? filter(section.data, searchText) : section.data;
      const itemsHidden = section.data.length - filteredData.length;

      return { ...section, data: filteredData, itemsHidden };
    });
    const noDataIsVisible =
      !isLoading && filteredData.filter((x) => x.data.length > 0).length === 0;
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
  }, [data, filter, filters, isLoading, searchText, filteringEnabled]);

  const filterConfig = filters
    .map(
      (filterControl: FilterControl<K>) =>
        `${filterControl.title}${filterControl.active ? '*' : ''}${
          filterControl.sortDirection !== undefined
            ? filterControl.sortDirection === SortDirection.Descending
              ? ' desc'
              : ' asc'
            : ''
        }${filterControl.hasSearchFilter ? '=' + searchText : ''}`
    )
    .join('; ');

  useEffect(() => {
    logger.debug('Filter config: ' + filterConfig);
  }, [filterConfig]);

  return (
    <RelistenSectionList
      data={sectionedData}
      pullToRefresh
      {...props}
      renderSectionHeader={(headerProps: SectionHeaderProps<T>) => {
        const { sectionTitle } = headerProps;
        if (sectionTitle === ALL_SECTION_SENTINEL) {
          if (shouldHideFilterBar) {
            return <></>;
          }

          return (
            <SectionHeader className="p-0">
              <FilterBar />
            </SectionHeader>
          );
        }

        if (sectionTitle === EMPTY_SECTION_SENTINEL) {
          if (headerProps.metadata && headerProps.metadata > 0) {
            return (
              <NonIdealState
                title={nonIdealState?.filtered?.title ?? 'No Results'}
                description={
                  nonIdealState?.filtered?.description ?? (
                    <>
                      Your filters are hiding <Plur count={headerProps.metadata} word="item" />, tap
                      below to clear them
                    </>
                  )
                }
                actionText="Remove Filters"
                onAction={clearFilters}
              />
            );
          } else {
            return (
              <NonIdealState
                title={nonIdealState?.noData?.title ?? 'No Results'}
                description={
                  nonIdealState?.noData?.description ??
                  'No data loaded, please refresh or adjust your filters.'
                }
              />
            );
          }
        }

        if (sectionTitle === FILTER_WARNING_SECTION_SENTINEL) {
          return (
            <>
              <RelistenText cn="py-2 italic text-sm px-4 text-gray-400 text-center">
                (<Plur count={headerProps.metadata} word="item" /> hidden due to filters)
              </RelistenText>

              <View className="mx-auto min-w-[33%]">
                <RelistenButton
                  onPress={clearFilters}
                  textClassName="text-sm"
                  intent="outline"
                  size="thin"
                >
                  Clear Filters
                </RelistenButton>
              </View>
            </>
          );
        }

        if (sectionTitle === HIDDEN_SECTION_SENTINEL) {
          return <></>;
        }

        if (headerProps.headerComponent) {
          return <View>{headerProps.headerComponent}</View>;
        }

        return <SectionHeader title={sectionTitle} />;
      }}
    />
  );
};
