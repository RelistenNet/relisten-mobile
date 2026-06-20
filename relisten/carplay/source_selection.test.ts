import { describe, expect, it } from 'vitest';
import { resolveSourcesForScope } from '@/relisten/carplay/source_selection';
import type { Show } from '@/relisten/realm/models/show';
import type { Source } from '@/relisten/realm/models/source';
import type { LibraryIndex } from '@/relisten/realm/library_index';

function source(uuid: string): Source {
  return { uuid } as Source;
}

function libraryIndex(
  options: {
    favoriteShowUuids?: string[];
    favoriteSourceUuids?: string[];
    offlineSourceUuids?: string[];
  } = {}
): Pick<LibraryIndex, 'showIsFavorite' | 'sourceHasOfflineTracks' | 'sourceIsFavorite'> {
  const favoriteShows = new Set(options.favoriteShowUuids ?? []);
  const favoriteSources = new Set(options.favoriteSourceUuids ?? []);
  const offlineSources = new Set(options.offlineSourceUuids ?? []);

  return {
    showIsFavorite: (showUuid) => !!showUuid && favoriteShows.has(showUuid),
    sourceHasOfflineTracks: (sourceUuid) => !!sourceUuid && offlineSources.has(sourceUuid),
    sourceIsFavorite: (sourceUuid) => !!sourceUuid && favoriteSources.has(sourceUuid),
  };
}

describe('resolveSourcesForScope', () => {
  const show = { uuid: 'show-1' } as Show;
  const sources = [source('source-1'), source('source-2')];

  it('uses scoped source favorites and offline sources for library source lists', () => {
    const result = resolveSourcesForScope(
      'library',
      show,
      sources,
      libraryIndex({
        favoriteSourceUuids: ['source-2'],
        offlineSourceUuids: ['source-1'],
      })
    );

    expect(result.displaySources.map((source) => source.uuid)).toEqual(['source-1', 'source-2']);
    expect(result.autoSelectSource).toBeUndefined();
  });

  it('falls back to all sources for a direct show favorite with no preferred source', () => {
    const result = resolveSourcesForScope(
      'library',
      show,
      sources,
      libraryIndex({
        favoriteShowUuids: ['show-1'],
      })
    );

    expect(result.displaySources).toEqual(sources);
    expect(result.autoSelectSource).toBeUndefined();
  });
});
