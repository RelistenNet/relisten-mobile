import { ScrollView, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useRealm } from '../realm/schema';
import { RelistenApiClient } from '../api/client';
import { Artist } from '../realm/artist';
import { Show } from '../realm/show';
import dayjs from 'dayjs';
import db from '../db/db';
import * as R from 'remeda';

export default function Test() {
  // const a = Artist.createFromDatabase({});
  const [artists, setArtists] = useState<Artist[]>([]);
  const realm = useRealm();
  // useEffect(() => {
  //     (async () => {
  //         const api = new RelistenApiClient();
  //         const artists = await api.artists();
  //
  //         await db.transaction(async conn => {
  //             for (const artist of artists) {
  //                 const dbArtist = new Artist();
  //                 dbArtist.copyFromApi(artist);
  //
  //                 await upsert(conn, dbArtist);
  //             }
  //         });
  //     })();
  // }, [setArtists]);
  useEffect(() => {
    (async () => {
      realm.write(() => {
        realm.deleteAll();
      });

      const api = new RelistenApiClient();

      const a = Date.now();

      const r = await api.fullNormalizedArtist('77a58ff9-2e01-c59c-b8eb-cff106049b72');

      const b = Date.now();

      let _dbArtist = realm.objectForPrimaryKey(Artist, r.artist.uuid);

      realm.write(() => {
        if (_dbArtist && dayjs(r.artist.updated_at).toDate() > _dbArtist.updatedAt) {
          console.log('updating artist');
          _dbArtist.copyFromApi(r.artist);
        } else if (!_dbArtist) {
          console.log('creating new artist');
          _dbArtist = Artist.createFromApi(realm, r.artist);
        }
      });

      const dbArtist = _dbArtist as Artist;

      async function doNextTick<T>(cb: () => Promise<T> | T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          setTimeout(async () => {
            const r = await cb();
            resolve(r);
          }, 0);
        });
      }

      async function yieldingChunkedIterator<T>(
        arr: T[],
        chunkSize: number,
        cb: (chunk: T[], idx: number) => void | Promise<void>
      ) {
        for (const [idx, chunk] of R.chunk(arr, chunkSize).entries()) {
          if (idx === 0) {
            const r = cb(chunk, idx);

            if (r) {
              await r;
            }
          }
          else {
            cb(chunk, idx);
            // await doNextTick(() => cb(chunk, idx));
          }
        }
      }

      realm.beginTransaction();

      let dbShows = R.flatMapToObj(realm.objects<Show>("Show").filtered("artistId == $0", dbArtist.uuid), (s: Show) => [[s.uuid, s]]);

      // await realm.write(async () => {
      try {
        await yieldingChunkedIterator(r.shows, 100, (showsChunk, idx) => {
          for (const show of showsChunk) {
            let dbShow = dbShows[show.uuid];

            if (dbShow && dayjs(show.updated_at).toDate() > dbShow.updatedAt) {
              // console.log('updating show');
              dbShow.copyFromApi(show);
            } else if (!dbShow) {
              dbShow = Show.createFromApi(realm, show);
              dbArtist.shows.push(dbShow);
            }
          }
        });

        realm.commitTransaction();
      } catch (e) {
        realm.cancelTransaction();
      }
      // });

      setArtists([dbArtist]);

      // const dbArtist = await db.transaction(async (conn) => {
      //   await upsert(
      //     conn,
      //     r.venues.map((m) => {
      //       const dbVenue = new Venue();
      //       dbVenue.copyFromApi(m);
      //       return dbVenue;
      //     })
      //   );
      //
      //   await upsert(
      //     conn,
      //     r.tours.map((m) => {
      //       const dbTour = new Tour();
      //       dbTour.copyFromApi(m);
      //       return dbTour;
      //     })
      //   );
      //
      //   await upsert(
      //     conn,
      //     r.songs.map((m) => {
      //       const dbSong = new SetlistSong();
      //       dbSong.copyFromApi(m);
      //       return dbSong;
      //     })
      //   );
      //
      //   await upsert(
      //     conn,
      //     r.shows.map((m) => {
      //       const dbShow = new Show();
      //       dbShow.copyFromApi(m);
      //       return dbShow;
      //     })
      //   );
      //
      //   await upsert(
      //     conn,
      //     r.years.map((m) => {
      //       const dbYear = new Year();
      //       dbYear.copyFromApi(m);
      //       return dbYear;
      //     })
      //   );
      //
      //   const dbArtist = new Artist();
      //   dbArtist.copyFromApi(r.artist);
      //   await upsert(conn, [dbArtist]);
      //
      //   return dbArtist;
      // });

      const c = Date.now();

      console.log(`API request: ${b - a}ms. DB writes: ${c - b}ms.`);
    })();
  }, [setArtists, realm]);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text>Open up App.tsx to start working on your app! hi</Text>
      {artists.map((a) => (
        <Text key={a.uuid}>
          {a.featured} {a.name}
        </Text>
      ))}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
