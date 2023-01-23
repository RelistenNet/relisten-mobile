import { RepoQueryHookResult, upsertNetworkResult } from './repo_query_hook';
import { ShowWithSources } from './models/show';
import { useEffect, useState } from 'react';
import { BehaviorSubject, Observable, merge, zip, of, combineLatest } from 'rxjs';
import { useRelistenApi } from '../api/context';
import { database, UpdatableFromApi } from './database';
import { Columns, Tables } from './schema';
import Show from './models/show';
import SourceSet, { SourceSetWithTracks } from './models/source_set';
import { Model, Q } from '@nozbe/watermelondb';
import Source from './models/source';
import { map, switchMap } from 'rxjs/operators';
import SourceTrack from './models/source_track';
import * as R from 'remeda';
import dayjs from 'dayjs';

import { Source as ApiSource } from '../api/models/source';
import { SourceSet as ApiSourceSet } from '../api/models/source_set';
import { SourceTrack as ApiSourceTrack } from '../api/models/source_tracks';
import { ShowWithSources as ApiShowWithSources } from '../api/models/source';

const MIN_TIME_API_CALLS_MS = 10 * 60 * 1000;

// TODO: DRY this out against repo_query_hook.ts to make it more generic
export function useFullShowQuery(
  showUuid: string
): () => RepoQueryHookResult<Observable<ShowWithSources>> {
  const subject$ = new BehaviorSubject<ShowWithSources | undefined>(undefined);
  let lastNetworkRequestStartedAt: dayjs.Dayjs | undefined = undefined;

  return () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isNetworkLoading, setIsNetworkLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [data, setData] = useState<Observable<ShowWithSources | undefined>>(subject$);
    // Because sometimes subject$.value hasn't updated by the same the return statement is executed
    const [lastDataValue, setLastDataValue] = useState<ShowWithSources | undefined>(subject$.value);
    const [error, setError] = useState<any | undefined>(undefined);

    const { apiClient } = useRelistenApi();

    const behavior = async () => {
      const showWithSources$ = await database.read(async () => {
        const show$ = database.get<Show>(Tables.shows).findAndObserve(showUuid);
        const sources$ = database
          .get<Source>(Tables.sources)
          .query(Q.where(Columns.sources.showId, showUuid))
          .observe();
        const sourceSets$ = database
          .get<SourceSet>(Tables.sourceSets)
          .query(Q.where(Columns.sourceSets.showId, showUuid))
          .observe();
        const sourceTracks$ = database
          .get<SourceTrack>(Tables.sourceTracks)
          .query(Q.where(Columns.sourceTracks.showId, showUuid))
          .observe();

        return combineLatest([show$, sources$, sourceSets$, sourceTracks$]).pipe(
          map((values) => {
            const [show, sources, sourceSets, sourceTracks] = values;
            const r: ShowWithSources = {
              show,
              sources: [],
            };

            const sourceTracksBySetId = R.groupBy(sourceTracks, (t) => t.sourceSetId);
            const sourceSetsBySourceId = R.groupBy(sourceSets, (t) => t.sourceId);

            for (const source of sources) {
              const sourceSets: SourceSetWithTracks[] = [];

              for (const sourceSet of sourceSetsBySourceId[source.id] || []) {
                sourceSets.push({
                  sourceSet,
                  sourceTracks: sourceTracksBySetId[sourceSet.id] || [],
                });
              }

              r.sources.push({
                source: source,
                sourceSets,
              });
            }

            return r;
          })
        );
      }, 'useFullShowQuery - reader');

      let receivedFirstResult = false;

      showWithSources$.subscribe(async (showWithSources) => {
        subject$.next(showWithSources);
        setLastDataValue(showWithSources);

        if (!receivedFirstResult) {
          receivedFirstResult = true;
          setIsLoading(false);

          const shouldMakeApiCall =
            lastNetworkRequestStartedAt === undefined ||
            dayjs().diff(lastNetworkRequestStartedAt) >= MIN_TIME_API_CALLS_MS;

          if (shouldMakeApiCall) {
            setIsNetworkLoading(true);

            const requestStartedAt = dayjs();
            let networkResponse: ApiShowWithSources;

            try {
              networkResponse = await apiClient.showWithSources(showUuid);
            } catch (e) {
              setError(e);
              setIsNetworkLoading(false);
              return;
            }

            const sourceTracks: ApiSourceTrack[] = [];
            const sourceSets: ApiSourceSet[] = [];
            const sources: ApiSource[] = networkResponse.sources;

            const dbSourceSetsWithTracks = R.flatMap(showWithSources.sources, (s) => s.sourceSets);

            const dbSourcesById = R.flatMapToObj(showWithSources.sources, (s) => [
              [s.source.id, s.source],
            ]);
            const dbSourceSetsById = R.flatMapToObj(
              dbSourceSetsWithTracks.map((set) => set.sourceSet),
              (s) => [[s.id, s]]
            );
            const dbSourceTracksById = R.flatMapToObj(
              R.flatMap(dbSourceSetsWithTracks, (set) => set.sourceTracks),
              (s) => [[s.id, s]]
            );

            for (const source of networkResponse.sources) {
              for (const sourceSet of source.sets) {
                sourceSet.__injected_show_uuid = showUuid;

                for (const sourceTrack of sourceSet.tracks) {
                  sourceTrack.__injected_show_uuid = showUuid;

                  sourceTracks.push(sourceTrack);
                }
              }

              sourceSets.push(...source.sets);
            }

            const promises: { [table: string]: Promise<Array<Model & UpdatableFromApi>> } = {};

            await database.write(async (writer) => {
              promises[Tables.sources] = upsertNetworkResult(
                database,
                Tables.sources,
                sources,
                dbSourcesById,
                writer
              );

              promises[Tables.sourceSets] = upsertNetworkResult(
                database,
                Tables.sourceSets,
                sourceSets,
                dbSourceSetsById,
                writer
              );

              promises[Tables.sourceTracks] = upsertNetworkResult(
                database,
                Tables.sourceTracks,
                sourceTracks,
                dbSourceTracksById,
                writer
              );

              await Promise.all(Object.values(promises));
            }, 'useFullShowQuery - write');

            setIsNetworkLoading(false);
            lastNetworkRequestStartedAt = requestStartedAt;
          }
        }
      });
    };

    useEffect(() => {
      behavior();
    }, [showUuid]);

    return {
      isLoading,
      isNetworkLoading,
      showLoadingIndicator: isLoading || (isNetworkLoading && lastDataValue === undefined),
      data,
      error,
    } as RepoQueryHookResult<Observable<ShowWithSources>>;
  };
}
