import { RelistenObject } from '../../api/models/relisten';
import { useEffect, useMemo } from 'react';
import {
  RelistenSectionList,
  RelistenSectionListData,
  RelistenSectionListProps,
} from '../relisten_section_list';
import { SectionHeader } from '../section_header';
import { useFilters } from './filters';
import { FilterBarButton } from './filter_bar_buttons';
import { FilterBar } from './filter_bar';

export type FilterableListProps<T extends RelistenObject> = {
  data: ReadonlyArray<T>;
  customSectionTitle?: (row: T) => string | undefined;
  customSectionTitles?: string[];
} & Omit<RelistenSectionListProps<T>, 'sections'>;

const ALL_SECTION_SENTINEL = '__ALL__';

export const FilterableList = <T extends RelistenObject>({
  data,
  customSectionTitle,
  customSectionTitles,
  ...props
}: FilterableListProps<T>) => {
  const { filters, onFilterButtonPress, filter, setRawData, filteredData } = useFilters<T>();

  const sectionedData: ReadonlyArray<RelistenSectionListData<T>> = useMemo(() => {
    if (!customSectionTitle || !customSectionTitles) {
      return [{ title: ALL_SECTION_SENTINEL, data: filteredData || [] }];
    }

    const obj: { [key: string]: T[] } = {};

    for (const r of data) {
      const title = customSectionTitle(r);

      if (title) {
        if (!obj[title]) {
          obj[title] = [];
        }

        obj[title].push(r);
      }
    }

    const r: Array<RelistenSectionListData<T>> = [];

    for (const title of customSectionTitles) {
      r.push({
        title,
        data: obj[title] || [],
      });
    }

    r.push({
      title: ALL_SECTION_SENTINEL,
      data: filteredData || [],
    });

    return r;
  }, [data, customSectionTitle, customSectionTitles, filter, filteredData]);

  useEffect(() => {
    setRawData(data);
  }, [data]);

  return (
    <RelistenSectionList
      sections={sectionedData}
      {...props}
      renderSectionHeader={({ section: { title } }) => {
        if (title === ALL_SECTION_SENTINEL) {
          return (
            <SectionHeader className="p-0 pt-3">
              <FilterBar>
                {filters.map((f) => {
                  return (
                    <FilterBarButton
                      key={f.title}
                      filter={f}
                      onPress={() => onFilterButtonPress(f)}
                    />
                  );
                })}
              </FilterBar>
            </SectionHeader>
          );
        }

        return <SectionHeader title={title} />;
      }}
    />
  );
};
