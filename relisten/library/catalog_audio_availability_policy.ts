export type AudioCatalogReference = {
  catalogType: 'artist' | 'show' | 'source' | 'source_track';
  catalogUuid?: string | null;
};

export type AudioCatalogTrack = {
  artistUuid: string;
  offlineInfo?: { isPlayableOffline(): boolean };
  showUuid: string;
  sourceUuid: string;
  uuid: string;
};

export function audioCatalogReferences(sourceTrack: AudioCatalogTrack): AudioCatalogReference[] {
  return [
    { catalogType: 'source_track', catalogUuid: sourceTrack.uuid },
    { catalogType: 'source', catalogUuid: sourceTrack.sourceUuid },
    { catalogType: 'show', catalogUuid: sourceTrack.showUuid },
    { catalogType: 'artist', catalogUuid: sourceTrack.artistUuid },
  ];
}

export function audioCatalogTargetKey(reference: AudioCatalogReference) {
  return `${reference.catalogType}:${reference.catalogUuid}`;
}

export function canUseNetworkAudioForTargets(
  unavailableTargetKeys: ReadonlySet<string>,
  sourceTrack: AudioCatalogTrack
) {
  return !audioCatalogReferences(sourceTrack).some(
    (reference) =>
      !!reference.catalogUuid && unavailableTargetKeys.has(audioCatalogTargetKey(reference))
  );
}

export function hasPlayableLocalFile(sourceTrack: AudioCatalogTrack) {
  return sourceTrack.offlineInfo?.isPlayableOffline() === true;
}

export function canPlaySourceTrackForTargets(
  unavailableTargetKeys: ReadonlySet<string>,
  sourceTrack: AudioCatalogTrack
) {
  return (
    hasPlayableLocalFile(sourceTrack) ||
    canUseNetworkAudioForTargets(unavailableTargetKeys, sourceTrack)
  );
}
