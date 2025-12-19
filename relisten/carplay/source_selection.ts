import { CarPlayScope } from '@/relisten/carplay/scope';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';

export function resolveSourcesForScope(scope: CarPlayScope, show: Show, sources: Source[]) {
  if (scope === 'browse') {
    return {
      displaySources: sources,
      autoSelectSource: sources.length === 1 ? sources[0] : undefined,
    };
  }

  if (scope === 'offline') {
    const offlineSources = sources.filter((source) => source.hasOfflineTracks);
    return {
      displaySources: offlineSources,
      autoSelectSource: offlineSources.length === 1 ? offlineSources[0] : undefined,
    };
  }

  const preferredSources = sources.filter((source) => source.isFavorite || source.hasOfflineTracks);

  if (show.isFavorite && preferredSources.length === 0) {
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
