import { Columns, Tables } from '../schema';
import { Model, Relation } from '@nozbe/watermelondb';
import { CopyableFromApi, UpdatableFromApi } from '../database';
import { SourceSet as ApiSourceSet } from '../../api/models/source_set';
import { date, field, relation } from '@nozbe/watermelondb/decorators';
import dayjs from 'dayjs';
import Artist from './artist';
import Source from './source';

const Column = Columns.sourceSets;

export default class SourceSet
  extends Model
  implements CopyableFromApi<ApiSourceSet>, UpdatableFromApi
{
  static table = Tables.sourceSets;
  static associations = {
    source_tracks: { type: 'has_many' as const, foreignKey: Columns.sourceTracks.sourceSetId },
  };
  @relation(Tables.artists, Column.artistId) artist!: Relation<Artist>;
  @relation(Tables.sources, Column.sourceId) source!: Relation<Source>;

  @date(Column.relistenCreatedAt) relistenCreatedAt!: Date;
  @date(Column.relistenUpdatedAt) relistenUpdatedAt!: Date;
  @field(Column.sourceId) sourceId!: string;
  @field(Column.artistId) artistId!: string;
  @field(Column.index) index!: number;
  @field(Column.isEncore) isEncore!: boolean;
  @field(Column.name) name!: string;

  copyFromApi(relistenObj: ApiSourceSet): void {
    this.relistenCreatedAt = dayjs(relistenObj.created_at).toDate();
    this.relistenUpdatedAt = dayjs(relistenObj.updated_at).toDate();
    this.sourceId = relistenObj.source_uuid;
    this.artistId = relistenObj.artist_uuid;
    this.index = relistenObj.index;
    this.isEncore = relistenObj.is_encore;
    this.name = relistenObj.name;
  }
}
