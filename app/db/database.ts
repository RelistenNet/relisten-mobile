import {Connection, createConnection} from 'typeorm';
import {ArtistEntity} from './entities/ArtistEntity';
import {Observable} from 'rxjs';
import {BaseEntity, createFromPOJO} from './entities/BaseEntity';
import {ArtistsApi} from '../api';

export interface Resource<T extends BaseEntity> {
  isLoading: boolean;
  error?: Error;
  data?: T[];
}

export class RelistenDb {
  static instance = new RelistenDb();

  private connection: Connection | undefined;

  private async getOrOpenConnection() {
    if (!this.connection) {
      this.connection = await createConnection({
        type: 'react-native',
        database: 'relisten',
        location: 'default',
        logging: ['error', 'query', 'schema'],
        synchronize: true,
        entities: [ArtistEntity],
      });
    }

    return this.connection;
  }

  async artistRepository() {
    return (await this.getOrOpenConnection()).getRepository(ArtistEntity);
  }

  artists(): Observable<Resource<ArtistEntity>> {
    return new Observable<Resource<ArtistEntity>>(subscriber => {
      (async () => {
        subscriber.next({isLoading: true});

        const artistRepo = await this.artistRepository();
        let artists = await artistRepo.find({order: {name: 'ASC'}});

        subscriber.next({isLoading: artists.length === 0, data: artists});

        const networkArtists = await new ArtistsApi().apiV2ArtistsGet();
        artists = networkArtists.map(a => createFromPOJO(ArtistEntity, a));

        await artistRepo.save(artists);

        artists = await artistRepo.find({order: {name: 'ASC'}});
        subscriber.next({isLoading: false, data: artists});
      })();
    });
  }
}
