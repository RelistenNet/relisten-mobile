import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const DEFAULT_TAB_INSET = 44;

export const TAB_INSET_ADAPTER_SOURCE = {
  legacyTabs: 'legacyTabs',
  nativeTabs: 'nativeTabs',
} as const;

export type TabInsetAdapterSource =
  (typeof TAB_INSET_ADAPTER_SOURCE)[keyof typeof TAB_INSET_ADAPTER_SOURCE];

export const LEGACY_TAB_INSET_REPORTER = {
  tabBar: 'legacy-tabs/tab-bar',
  relistenGroup: 'legacy-tabs/group/relisten',
  libraryGroup: 'legacy-tabs/group/artists-myLibrary-offline',
} as const;

export const NATIVE_TAB_INSET_REPORTER = {
  tabSlot: 'native-tabs/tab-slot',
  relistenGroup: 'native-tabs/group/relisten',
  libraryGroup: 'native-tabs/group/artists-myLibrary-offline',
} as const;

export interface TabInsetReport {
  sourceId: string;
  bottomInset: number;
  sourceAdapter?: TabInsetAdapterSource;
}

export interface TabInsetSnapshot {
  bottomInset: number;
  sourceAdapter: TabInsetAdapterSource;
  lastUpdatedAt: number;
}

export interface TabInsetAdapterContract extends TabInsetSnapshot {
  reportInset: (report: TabInsetReport) => void;
  clearInset: (sourceId: string) => void;
}

interface TabInsetAdapterProviderProps extends PropsWithChildren {
  sourceAdapter?: TabInsetAdapterSource;
}

type ReportedInsetsByAdapter = Record<TabInsetAdapterSource, Record<string, number>>;
type LastKnownInsetByAdapter = Record<TabInsetAdapterSource, number>;

const DEFAULT_TAB_INSET_SNAPSHOT: TabInsetSnapshot = {
  bottomInset: DEFAULT_TAB_INSET,
  sourceAdapter: TAB_INSET_ADAPTER_SOURCE.legacyTabs,
  lastUpdatedAt: 0,
};

const DEFAULT_CONTEXT_VALUE: TabInsetAdapterContract = {
  ...DEFAULT_TAB_INSET_SNAPSHOT,
  reportInset: () => {},
  clearInset: () => {},
};

const TabInsetAdapterContext = createContext<TabInsetAdapterContract>(DEFAULT_CONTEXT_VALUE);

const DEFAULT_CONFIGURED_TAB_INSET_ADAPTER_SOURCE = resolveTabInsetAdapterSource(
  process.env.EXPO_PUBLIC_PLAYER_TAB_INSET_ADAPTER
);
const FALLBACK_ADAPTER_SOURCE: Record<TabInsetAdapterSource, TabInsetAdapterSource> = {
  [TAB_INSET_ADAPTER_SOURCE.legacyTabs]: TAB_INSET_ADAPTER_SOURCE.nativeTabs,
  [TAB_INSET_ADAPTER_SOURCE.nativeTabs]: TAB_INSET_ADAPTER_SOURCE.legacyTabs,
};

const normalizeInset = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
};

const selectReportedInset = (reports: Record<string, number>): number => {
  const reportValues = Object.values(reports);

  if (reportValues.length === 0) {
    return 0;
  }

  return Math.max(0, ...reportValues);
};

const createEmptyReportedInsetsByAdapter = (): ReportedInsetsByAdapter => ({
  [TAB_INSET_ADAPTER_SOURCE.legacyTabs]: {},
  [TAB_INSET_ADAPTER_SOURCE.nativeTabs]: {},
});

const DEFAULT_LAST_KNOWN_INSET_BY_ADAPTER: LastKnownInsetByAdapter = {
  [TAB_INSET_ADAPTER_SOURCE.legacyTabs]: DEFAULT_TAB_INSET,
  [TAB_INSET_ADAPTER_SOURCE.nativeTabs]: DEFAULT_TAB_INSET,
};

export function resolveTabInsetAdapterSource(
  sourceValue: string | null | undefined
): TabInsetAdapterSource {
  return sourceValue === TAB_INSET_ADAPTER_SOURCE.nativeTabs
    ? TAB_INSET_ADAPTER_SOURCE.nativeTabs
    : TAB_INSET_ADAPTER_SOURCE.legacyTabs;
}

export const TabInsetAdapterProvider = ({
  children,
  sourceAdapter,
}: TabInsetAdapterProviderProps) => {
  const selectedSourceAdapter = sourceAdapter ?? DEFAULT_CONFIGURED_TAB_INSET_ADAPTER_SOURCE;
  const [reportedInsetsByAdapter, setReportedInsetsByAdapter] = useState<ReportedInsetsByAdapter>(
    createEmptyReportedInsetsByAdapter
  );
  const [lastUpdatedAt, setLastUpdatedAt] = useState(DEFAULT_TAB_INSET_SNAPSHOT.lastUpdatedAt);
  const [lastKnownInsetByAdapter, setLastKnownInsetByAdapter] = useState<LastKnownInsetByAdapter>(
    DEFAULT_LAST_KNOWN_INSET_BY_ADAPTER
  );

  const reportInset = useCallback((report: TabInsetReport) => {
    const reportSourceAdapter = report.sourceAdapter ?? TAB_INSET_ADAPTER_SOURCE.legacyTabs;
    const nextInset = normalizeInset(report.bottomInset);
    setReportedInsetsByAdapter((current) => {
      const currentSourceReports = current[reportSourceAdapter];
      if (currentSourceReports[report.sourceId] === nextInset) {
        return current;
      }

      return {
        ...current,
        [reportSourceAdapter]: {
          ...currentSourceReports,
          [report.sourceId]: nextInset,
        },
      };
    });
    if (nextInset > 0) {
      setLastKnownInsetByAdapter((current) => {
        if (current[reportSourceAdapter] === nextInset) {
          return current;
        }

        return {
          ...current,
          [reportSourceAdapter]: nextInset,
        };
      });
    }
    setLastUpdatedAt(Date.now());
  }, []);

  const clearInset = useCallback((sourceId: string) => {
    setReportedInsetsByAdapter((current) => {
      let hasChanged = false;
      const next: ReportedInsetsByAdapter = {
        [TAB_INSET_ADAPTER_SOURCE.legacyTabs]: current[TAB_INSET_ADAPTER_SOURCE.legacyTabs],
        [TAB_INSET_ADAPTER_SOURCE.nativeTabs]: current[TAB_INSET_ADAPTER_SOURCE.nativeTabs],
      };

      for (const adapterSource of Object.values(TAB_INSET_ADAPTER_SOURCE)) {
        if (!(sourceId in current[adapterSource])) {
          continue;
        }

        hasChanged = true;
        const adapterReports = { ...current[adapterSource] };
        delete adapterReports[sourceId];
        next[adapterSource] = adapterReports;
      }

      return hasChanged ? next : current;
    });
    setLastUpdatedAt(Date.now());
  }, []);

  const bottomInset = useMemo(() => {
    const selectedReportedInset = selectReportedInset(
      reportedInsetsByAdapter[selectedSourceAdapter]
    );
    if (selectedReportedInset > 0) {
      return selectedReportedInset;
    }

    const fallbackSourceAdapter = FALLBACK_ADAPTER_SOURCE[selectedSourceAdapter];
    const fallbackReportedInset = selectReportedInset(
      reportedInsetsByAdapter[fallbackSourceAdapter]
    );
    if (fallbackReportedInset > 0) {
      return fallbackReportedInset;
    }

    const selectedLastKnownInset = lastKnownInsetByAdapter[selectedSourceAdapter];
    if (selectedLastKnownInset > 0) {
      return selectedLastKnownInset;
    }

    const fallbackLastKnownInset = lastKnownInsetByAdapter[fallbackSourceAdapter];
    if (fallbackLastKnownInset > 0) {
      return fallbackLastKnownInset;
    }

    return DEFAULT_TAB_INSET;
  }, [lastKnownInsetByAdapter, reportedInsetsByAdapter, selectedSourceAdapter]);

  const value = useMemo<TabInsetAdapterContract>(
    () => ({
      bottomInset,
      sourceAdapter: selectedSourceAdapter,
      lastUpdatedAt,
      reportInset,
      clearInset,
    }),
    [bottomInset, clearInset, lastUpdatedAt, reportInset, selectedSourceAdapter]
  );

  return (
    <TabInsetAdapterContext.Provider value={value}>{children}</TabInsetAdapterContext.Provider>
  );
};

export const useTabInsetAdapter = () => {
  const context = useContext(TabInsetAdapterContext);

  if (context === undefined) {
    throw new Error('useTabInsetAdapter must be used within a TabInsetAdapterProvider');
  }

  return context;
};

export const useTabInsetSnapshot = (): TabInsetSnapshot => {
  const { bottomInset, sourceAdapter, lastUpdatedAt } = useTabInsetAdapter();

  return { bottomInset, sourceAdapter, lastUpdatedAt };
};

export const useTabInsetReporter = (sourceId: string, bottomInset: number) => {
  const { clearInset, reportInset } = useTabInsetAdapter();

  useEffect(() => {
    reportInset({
      sourceId,
      bottomInset,
      sourceAdapter: TAB_INSET_ADAPTER_SOURCE.legacyTabs,
    });

    return () => {
      clearInset(sourceId);
    };
  }, [bottomInset, clearInset, reportInset, sourceId]);
};

export const useNativeTabInsetReporter = (sourceId: string, bottomInset: number) => {
  const { clearInset, reportInset } = useTabInsetAdapter();

  useEffect(() => {
    reportInset({
      sourceId,
      bottomInset,
      sourceAdapter: TAB_INSET_ADAPTER_SOURCE.nativeTabs,
    });

    return () => {
      clearInset(sourceId);
    };
  }, [bottomInset, clearInset, reportInset, sourceId]);
};
