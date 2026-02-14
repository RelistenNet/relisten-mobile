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

export interface TabInsetReport {
  sourceId: string;
  bottomInset: number;
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

export const TabInsetAdapterProvider = ({ children }: PropsWithChildren) => {
  const [reportedInsets, setReportedInsets] = useState<Record<string, number>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(DEFAULT_TAB_INSET_SNAPSHOT.lastUpdatedAt);
  const [lastKnownBottomInset, setLastKnownBottomInset] = useState(DEFAULT_TAB_INSET);

  const reportInset = useCallback((report: TabInsetReport) => {
    const nextInset = normalizeInset(report.bottomInset);
    setReportedInsets((current) => {
      if (current[report.sourceId] === nextInset) {
        return current;
      }

      return { ...current, [report.sourceId]: nextInset };
    });
    if (nextInset > 0) {
      setLastKnownBottomInset(nextInset);
    }
    setLastUpdatedAt(Date.now());
  }, []);

  const clearInset = useCallback((sourceId: string) => {
    setReportedInsets((current) => {
      if (!(sourceId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    setLastUpdatedAt(Date.now());
  }, []);

  const bottomInset = useMemo(() => {
    const reportedInset = selectReportedInset(reportedInsets);
    if (reportedInset > 0) {
      return reportedInset;
    }

    return lastKnownBottomInset;
  }, [lastKnownBottomInset, reportedInsets]);

  const value = useMemo<TabInsetAdapterContract>(
    () => ({
      bottomInset,
      sourceAdapter: TAB_INSET_ADAPTER_SOURCE.legacyTabs,
      lastUpdatedAt,
      reportInset,
      clearInset,
    }),
    [bottomInset, clearInset, lastUpdatedAt, reportInset]
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
    reportInset({ sourceId, bottomInset });

    return () => {
      clearInset(sourceId);
    };
  }, [bottomInset, clearInset, reportInset, sourceId]);
};
