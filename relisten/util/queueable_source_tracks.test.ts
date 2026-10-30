import { describe, expect, it, vi } from 'vitest';
import type { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import type { Source } from '@/relisten/realm/models/source';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { getQueueableSourceTracks } from '@/relisten/util/queueable_source_tracks';

function sourceWithTracks(tracks: SourceTrack[]): Source {
  return {
    allSourceTracks: () => tracks,
  } as Source;
}

function track(uuid: string, playableOffline: boolean): SourceTrack {
  return {
    uuid,
    playable: vi.fn(() => playableOffline),
  } as unknown as SourceTrack;
}

describe('getQueueableSourceTracks', () => {
  it('keeps every track in source order when streaming is allowed', () => {
    const first = track('set-1-track-1', true);
    const second = track('set-1-track-2', false);
    const encore = track('set-2-track-1', true);

    const queueableTracks = getQueueableSourceTracks(
      sourceWithTracks([first, second, encore]),
      false,
      'automatic' as OfflineModeSetting
    );

    expect(queueableTracks).toEqual([first, second, encore]);
    expect(first.playable).not.toHaveBeenCalled();
    expect(second.playable).not.toHaveBeenCalled();
    expect(encore.playable).not.toHaveBeenCalled();
  });

  it('excludes tracks that cannot play offline from the Offline tab', () => {
    const available = track('available', true);
    const unavailable = track('unavailable', false);

    const queueableTracks = getQueueableSourceTracks(
      sourceWithTracks([available, unavailable]),
      true,
      'automatic' as OfflineModeSetting
    );

    expect(queueableTracks).toEqual([available]);
    expect(available.playable).toHaveBeenCalledWith(false);
    expect(unavailable.playable).toHaveBeenCalledWith(false);
  });

  it('excludes tracks that cannot play offline in Always Offline Mode', () => {
    const available = track('available', true);
    const unavailable = track('unavailable', false);

    const queueableTracks = getQueueableSourceTracks(
      sourceWithTracks([available, unavailable]),
      false,
      'always_offline' as OfflineModeSetting
    );

    expect(queueableTracks).toEqual([available]);
  });
});
