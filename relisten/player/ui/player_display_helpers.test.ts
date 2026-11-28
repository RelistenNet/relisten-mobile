import { describe, expect, it } from 'vitest';
import { type SourceTrack } from '@/relisten/realm/models/source_track';
import { playerTrackAccessibilityLabel, queueLinks } from './player_display_helpers';

function performance(displayDate: string, venue?: { name: string; location: string }) {
  return {
    title: 'Scarlet Begonias>Fire on the Mountain',
    artist: { name: 'Grateful Dead' },
    show: { displayDate, venue },
  } as SourceTrack;
}

describe('spoken performance identity', () => {
  it('distinguishes same-title performances by show date and includes venue and location', () => {
    const cornell = playerTrackAccessibilityLabel(
      performance('1977-05-08', {
        name: 'Barton Hall',
        location: 'Ithaca, NY',
      })
    );
    const buffalo = playerTrackAccessibilityLabel(
      performance('1977-05-09', {
        name: 'Buffalo Memorial Auditorium',
        location: 'Buffalo, NY',
      })
    );

    expect(cornell).toBe(
      'Scarlet Begonias > Fire on the Mountain, Grateful Dead, May 8, 1977, Barton Hall, Ithaca, NY'
    );
    expect(buffalo).toBe(
      'Scarlet Begonias > Fire on the Mountain, Grateful Dead, May 9, 1977, Buffalo Memorial Auditorium, Buffalo, NY'
    );
  });

  it('keeps the artist and show date when the catalog has no venue', () => {
    expect(playerTrackAccessibilityLabel(performance('2026-10-15'))).toBe(
      'Scarlet Begonias > Fire on the Mountain, Grateful Dead, Oct 15, 2026'
    );
  });
});

describe('queue links', () => {
  const track = (link?: string) => ({
    playlistContext: link ? { segmentInstanceId: link } : undefined,
  });

  it('marks runs of one link and gives split-off parts their own run', () => {
    const queue = [track('a'), track('a'), track('a'), track(), track('a'), track('a')];
    expect(queueLinks(queue)).toEqual([
      { position: 'first', run: 0 },
      { position: 'middle', run: 0 },
      { position: 'last', run: 0 },
      { position: undefined, run: 1 },
      { position: 'first', run: 2 },
      { position: 'last', run: 2 },
    ]);
  });
});
