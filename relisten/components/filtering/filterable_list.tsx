import { useMemo } from 'react';
import { RelistenObject } from '../../api/models/relisten';
import {
  RelistenSectionHeader,
  RelistenSectionList,
  RelistenSectionListProps,
} from '../relisten_section_list';
import { SectionHeader } from '../section_header';
import { FilterBar } from './filter_bar';
import { FilterBarButton } from './filter_bar_buttons';
import { useFilters } from './filters';

export type FilterableListProps<T extends RelistenObject> = {
  data: ReadonlyArray<T>;
  customSectionTitle?: (row: T) => string | undefined;
  customSectionTitles?: string[];
  hideFilterBar?: boolean;
} & RelistenSectionListProps<T>;

const ALL_SECTION_SENTINEL = '__ALL__';

export const FilterableList = <K extends string, T extends RelistenObject>({
  data,
  customSectionTitle,
  customSectionTitles,
  hideFilterBar,
  ...props
}: FilterableListProps<T>) => {
  const { filters, onFilterButtonPress, filter } = useFilters<K, T>();

  const sectionedData: ReadonlyArray<T | RelistenSectionHeader> = useMemo(() => {
    const filteredData = filter(data);
    if (!customSectionTitle || !customSectionTitles) {
      return [{ sectionTitle: ALL_SECTION_SENTINEL }, ...(filteredData || [])];
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

    const r: Array<T | RelistenSectionHeader> = [];

    for (const sectionTitle of customSectionTitles) {
      r.push({
        sectionTitle,
      });
      if (obj[sectionTitle]?.length) {
        r.push(...obj[sectionTitle]);
      }
    }

    r.push({
      sectionTitle: ALL_SECTION_SENTINEL,
    });
    r.push(...(filteredData || []));

    return r;
  }, [data, customSectionTitle, customSectionTitles, filter, filters]);

  return (
    <RelistenSectionList
      // sections={sectionedData}
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
