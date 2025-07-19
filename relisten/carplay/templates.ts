import { CarPlay, ListTemplate, ListItem } from '@g4rb4g3/react-native-carplay/src';
import { Artist } from '@/relisten/realm/models/artist';
import { Realm } from '@realm/react';
import { Results } from 'realm';
import plur from 'plur';
import React from 'react';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
import { artistsNetworkBackedBehavior } from '@/relisten/realm/models/artist_repo';
import { RelistenApiClient } from '@/relisten/api/client';
import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { TabBarTemplate, Template } from '@g4rb4g3/react-native-carplay';
import { TabBarTemplates } from '@g4rb4g3/react-native-carplay/src/templates/TabBarTemplate';
import { log } from '../util/logging';

const logger = log.extend('carplay');

class RelistenCarPlayContext {
  constructor(
    public readonly realm: Realm,
    public readonly apiClient: RelistenApiClient
  ) {}

  private teardowns: Array<() => void> = [];

  addTeardown(teardown: () => void) {
    this.teardowns.push(teardown);
  }

  tearDown() {
    for (const teardown of this.teardowns) {
      try {
        teardown();
      } catch (e) {
        logger.error('Error tearing down carplay context', e);
      }
    }

    this.teardowns = [];
  }
}

export function setupCarPlay(realm: Realm, apiClient: RelistenApiClient) {
  const ctx = new RelistenCarPlayContext(realm, apiClient);

  CarPlay.setRootTemplate(
    new TabBarTemplate({
      title: 'Relisten',
      templates: [createArtistsListTemplate(ctx)],
    }),
    true
  );

  CarPlay.enableNowPlaying();

  return () => ctx.tearDown();
}

function networkBackedResultsListTemplate<T>(
  results: NetworkBackedResults<T>,
  contentHandler: (data: T) => TabBarTemplates
) {
  if (results.isNetworkLoading) {
    return new ListTemplate({
      title: 'Loading...',
      sections: [{ items: [{ text: 'Loading...' }] }],
    });
  }

  return contentHandler(results.data);
}

function createArtistsListTemplate(ctx: RelistenCarPlayContext): ListTemplate {
  const artistsBehavior = artistsNetworkBackedBehavior(ctx.realm, false);
  const executor = artistsBehavior.sharedExecutor(ctx.apiClient);

  const results = executor.start();

  const template = new ListTemplate({
    title: 'Relisten',
    async onItemSelect(item: { templateId: string; index: number; id: string }): Promise<void> {
      const selectedArtist = results.currentValue.data[item.index];
      console.log('carplay selected', item);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading...'],
    tabTitle: 'Relisten',
  });

  results.addListener((nextValue) => {
    const artists = nextValue.data;

    const sections: ListSection[] = [];

    const all = [...artists].sort((a, b) => {
      return a.sortName.localeCompare(b.sortName);
    });

    const createItem = (a: Artist) => {
      return { text: a.name };
    };

    const favorites = all.filter((a) => a.isFavorite);

    if (favorites.length > 0) {
      sections.push({
        header: 'Favorites',
        items: favorites.map(createItem),
      });
    }

    const featured = all.filter((a) => a.featured !== 0);

    sections.push({ header: 'Featured', items: featured.map(createItem) });

    sections.push({
      header: `${all.length} ${plur('artist', all.length)}`,
      items: all.map(createItem),
    });

    template.updateSections(sections);
  });

  ctx.addTeardown(() => results.tearDown());

  return template;
}
