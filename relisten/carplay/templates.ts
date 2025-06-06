import { CarPlay, ListTemplate, ListItem } from '@g4rb4g3/react-native-carplay/src';
import { Artist } from '@/relisten/realm/models/artist';
import { Realm } from '@realm/react';
import { Results } from 'realm';
import plur from 'plur';
import React from 'react';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';

export function setupCarPlay(realm: Realm) {
  const artists = realm.objects<Artist>(Artist.schema.name);
  CarPlay.setRootTemplate(createArtistsListTemplate(artists), true);
}

function createArtistsListTemplate(artists: Results<Artist>): ListTemplate {
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

  return new ListTemplate({
    title: 'Relisten',
    async onItemSelect(item: { templateId: string; index: number; id: string }): Promise<void> {
      console.log('carplay selected', item);
    },
    sections: sections,
  });
}
