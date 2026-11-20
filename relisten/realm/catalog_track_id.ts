import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

/** The catalog's v4 ID for a stored recording, as account and Sonos APIs name tracks. */
export const trackIdForSourceTrack = (sourceTrack: Pick<SourceTrack, 'uuid'>) =>
  formatUuidTypedId('track', sourceTrack.uuid);
