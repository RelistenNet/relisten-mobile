import type Realm from 'realm';
import { useMemo } from 'react';
import {
  CatalogAvailability,
  CatalogAvailabilityStatus,
  catalogAvailabilityKey,
} from '@/relisten/realm/models/library';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { useQuery } from '@/relisten/realm/schema';
import {
  audioCatalogReferences,
  hasPlayableLocalFile,
} from '@/relisten/library/catalog_audio_availability_policy';

export {
  canPlaySourceTrackForTargets,
  canUseNetworkAudioForTargets,
  hasPlayableLocalFile,
} from '@/relisten/library/catalog_audio_availability_policy';

/**
 * A persisted unavailable answer blocks only network media. A successful local
 * download remains playable because licensing removal does not purge files the
 * listener already chose to keep on this device.
 */
export function canUseNetworkAudio(realm: Realm | undefined, sourceTrack: SourceTrack) {
  if (!realm || realm.isClosed) {
    return true;
  }

  return !audioCatalogReferences(sourceTrack).some(({ catalogType, catalogUuid }) => {
    if (!catalogUuid) {
      return false;
    }

    return (
      realm.objectForPrimaryKey(
        CatalogAvailability,
        catalogAvailabilityKey(catalogType, catalogUuid)
      )?.status === CatalogAvailabilityStatus.Unavailable
    );
  });
}

export function useUnavailableCatalogTargetKeys() {
  const unavailable = useQuery(
    CatalogAvailability,
    (query) => query.filtered('status == $0', CatalogAvailabilityStatus.Unavailable),
    []
  );
  const targetKeyFingerprint = unavailable
    .map((entry) => entry.targetKey)
    .sort()
    .join('\u0000');

  return useMemo(
    () => new Set(targetKeyFingerprint ? targetKeyFingerprint.split('\u0000') : []),
    [targetKeyFingerprint]
  );
}

export function canPlaySourceTrack(realm: Realm | undefined, sourceTrack: SourceTrack) {
  return hasPlayableLocalFile(sourceTrack) || canUseNetworkAudio(realm, sourceTrack);
}
