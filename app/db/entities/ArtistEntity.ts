import {ArtistUpstreamSource, ArtistWithCounts, Features} from '../../api';
import {Column, Entity, PrimaryColumn} from 'typeorm';
import {BaseEntity} from './BaseEntity';

@Entity()
export class ArtistEntity extends BaseEntity implements ArtistWithCounts {
  @Column()
  createdAt: Date;
  @Column()
  featured: number;

  @Column('simple-json')
  features: Features;

  @Column()
  id: number;

  @Column()
  musicbrainzId: string;
  @Column()
  name: string;
  @Column()
  showCount: number;
  @Column()
  slug: string;
  @Column()
  sortName: string;
  @Column()
  sourceCount: number;
  @Column()
  updatedAt: Date;

  @Column('simple-json')
  upstreamSources: Array<ArtistUpstreamSource>;

  @PrimaryColumn()
  uuid: string;

  @Column({default: false})
  favorite: boolean = false;
  @Column({default: false})
  hasOfflineTrack: boolean = false;
}
