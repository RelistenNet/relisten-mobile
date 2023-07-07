// Create a configuration object
import { createRealmContext } from '@realm/react';
import Realm from 'realm';
import { Artist } from './models/artist';
import { Year } from './models/year';
import { Show } from './models/show';
import { Venue } from './models/venue';
import { Source } from './models/source';
import { SourceSet } from './models/source_set';
import { SourceTrack } from './models/source_track';

const realmConfig: Realm.Configuration = {
  schema: [Artist, Year, Show, Venue, Source, SourceSet, SourceTrack],
  deleteRealmIfMigrationNeeded: true,
};

export const { RealmProvider, useRealm, useObject, useQuery } = createRealmContext(realmConfig);
