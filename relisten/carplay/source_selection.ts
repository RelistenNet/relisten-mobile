import type { CarPlayScope } from '@/relisten/carplay/scope';
import type { Show } from '@/relisten/realm/models/show';
import type { Source } from '@/relisten/realm/models/source';
import type { LibraryIndex } from '@/relisten/realm/library_index';

export function resolveSourcesForScope(
  scope: CarPlayScope,
  show: Show,
  sources: Source[],
  libraryIndex: Pick<LibraryIndex, 'showIsFavorite' | 'sourceHasOfflineTracks' | 'sourceIsFavorite'>
) {
  if (scope === 'browse') {
    return {
      displaySources: sources,
      autoSelectSource: sources.length === 1 ? sources[0] : undefined,
    };
  }

  if (scope === 'offline') {
    const offlineSources = sources.filter((source) =>
      libraryIndex.sourceHasOfflineTracks(source.uuid)
    );
    return {
      displaySources: offlineSources,
      autoSelectSource: offlineSources.length === 1 ? offlineSources[0] : undefined,
    };
  }

  const preferredSources = sources.filter(
    (source) =>
      libraryIndex.sourceIsFavorite(source.uuid) || libraryIndex.sourceHasOfflineTracks(source.uuid)
  );

  if (libraryIndex.showIsFavorite(show.uuid) && preferredSources.length === 0) {
    return {
      displaySources: sources,
      autoSelectSource: sources.length === 1 ? sources[0] : undefined,
    };
  }

  return {
    displaySources: preferredSources,
    autoSelectSource: preferredSources.length === 1 ? preferredSources[0] : undefined,
  };
}
