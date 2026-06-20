import Realm from 'realm';

export enum UserPlaylistVisibility {
  Private = 'private',
  Unlisted = 'unlisted',
  Public = 'public',
}

export enum UserPlaylistAccessRole {
  Owner = 'owner',
  Editor = 'editor',
  Viewer = 'viewer',
}

export class UserPlaylist extends Realm.Object<UserPlaylist> {
  static schema: Realm.ObjectSchema = {
    name: 'UserPlaylist',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      uuid: { type: 'string', indexed: true },
      name: 'string',
      description: 'string?',
      visibility: 'string',
      ownerUserUuid: 'string?',
      currentRevision: { type: 'int', default: 0 },
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: 'date?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  uuid!: string;
  name!: string;
  description?: string;
  visibility!: UserPlaylistVisibility;
  ownerUserUuid?: string;
  currentRevision!: number;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
}

export class UserPlaylistEntry extends Realm.Object<UserPlaylistEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'UserPlaylistEntry',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      uuid: { type: 'string', indexed: true },
      playlistUuid: { type: 'string', indexed: true },
      sourceTrackUuid: { type: 'string', indexed: true },
      blockUuid: { type: 'string', indexed: true, optional: true },
      blockPosition: 'int?',
      position: 'string',
      title: 'string?',
      unavailableReason: 'string?',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: 'date?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  uuid!: string;
  playlistUuid!: string;
  sourceTrackUuid!: string;
  blockUuid?: string;
  blockPosition?: number;
  position!: string;
  title?: string;
  unavailableReason?: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
}

// Share/access token secrets belong in secure storage; Realm keeps relationship metadata only.
export class UserMobileAccessGrant extends Realm.Object<UserMobileAccessGrant> {
  static schema: Realm.ObjectSchema = {
    name: 'UserMobileAccessGrant',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      uuid: { type: 'string', indexed: true },
      playlistUuid: { type: 'string', indexed: true },
      role: 'string',
      grantType: 'string',
      metadataJson: 'string?',
      createdAt: 'date',
      updatedAt: 'date',
      expiresAt: 'date?',
      revokedAt: 'date?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  uuid!: string;
  playlistUuid!: string;
  role!: UserPlaylistAccessRole;
  grantType!: string;
  metadataJson?: string;
  createdAt!: Date;
  updatedAt!: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}
