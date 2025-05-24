import CarPlay, { ListTemplate, ListItem } from 'react-native-carplay';
import { RelistenApiClient } from '../api/client';

const api = new RelistenApiClient();

async function getAllArtists() {
  const resp = await api.artists();
  return resp.data || [];
}

async function getYearsForArtist(artistUuid: string) {
  const resp = await api.years(artistUuid);
  return resp.data || [];
}

async function getShowsForYear(artistUuid: string, yearUuid: string) {
  const resp = await api.year(artistUuid, yearUuid);
  return resp.data?.shows || [];
}

async function getSourcesForShow(showUuid: string) {
  const resp = await api.showWithSources(showUuid);
  return resp.data?.sources || [];
}

export async function setupCarPlay() {
  const artists = await getAllArtists();
  CarPlay.setRootTemplate(createArtistsListTemplate(artists), true);
}

function createArtistsListTemplate(artists: any[]): ListTemplate {
  return {
    type: 'list',
    title: 'Artists',
    sections: [
      {
        items: artists.map((artist) => ({
          text: artist.name,
          onPress: async () => {
            const years = await getYearsForArtist(artist.uuid);
            CarPlay.pushTemplate(createYearsListTemplate(artist.uuid, years), true);
          },
        } as ListItem)),
      },
    ],
  } as ListTemplate;
}

function createYearsListTemplate(artistUuid: string, years: any[]): ListTemplate {
  return {
    type: 'list',
    title: 'Years',
    sections: [
      {
        items: years.map((year) => ({
          text: String(year.year),
          onPress: async () => {
            const shows = await getShowsForYear(artistUuid, year.uuid);
            CarPlay.pushTemplate(createShowsListTemplate(artistUuid, year.uuid, shows), true);
          },
        } as ListItem)),
      },
    ],
  } as ListTemplate;
}

function createShowsListTemplate(artistUuid: string, yearUuid: string, shows: any[]): ListTemplate {
  return {
    type: 'list',
    title: 'Shows',
    sections: [
      {
        items: shows.map((show) => ({
          text: show.display_date,
          onPress: async () => {
            const sources = await getSourcesForShow(show.uuid);
            CarPlay.pushTemplate(createSourcesListTemplate(sources), true);
          },
        } as ListItem)),
      },
    ],
  } as ListTemplate;
}

function createSourcesListTemplate(sources: any[]): ListTemplate {
  return {
    type: 'list',
    title: 'Sources',
    sections: [
      {
        items: sources.map((source) => ({
          text: source.source,
          onPress: () => {},
        } as ListItem)),
      },
    ],
  } as ListTemplate;
}
