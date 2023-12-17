import { components } from '../schema';

export type Song = components['schemas']['Song'];
export type Shows = components['schemas']['Show'][];
export type SongWithPlayCount = components['schemas']['SetlistSongWithPlayCount'];
export type SongWithShows = components['schemas']['SetlistSongWithShows'];
