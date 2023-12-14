import { useMemo } from 'react';
import { RelistenObject } from '../../api/models/relisten';
import {
  RelistenSectionHeader,
  RelistenSectionList,
  RelistenSectionListData,
  RelistenSectionListProps,
} from '../relisten_section_list';
import { useFilters } from './filters';
import { SectionHeader } from '../section_header';
import { FilterBar } from './filter_bar';
import { FilterBarButton } from './filter_bar_buttons';

export type FilterableListProps<T extends RelistenObject> = {
  data: ReadonlyArray<T>;
  customSectionTitle?: (row: T) => string | undefined;
  customSectionTitles?: string[];
} & RelistenSectionListProps<T>;

const ALL_SECTION_SENTINEL = '__ALL__';

export const FilterableList = <T extends RelistenObject>({
  data,
  customSectionTitle,
  customSectionTitles,
  ...props
}: FilterableListProps<T>) => {
  const { filters, onFilterButtonPress, filter } = useFilters<T>();

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
      {...props}
      renderSectionHeader={({ sectionTitle }) => {
        if (sectionTitle === ALL_SECTION_SENTINEL) {
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

        return <SectionHeader title={sectionTitle} />;
      }}
    />
  );
};
