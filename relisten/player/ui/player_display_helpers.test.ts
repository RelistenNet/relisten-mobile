import { describe, expect, it } from 'vitest';
import { type SourceTrack } from '@/relisten/realm/models/source_track';
import { playerTrackAccessibilityLabel } from './player_display_helpers';

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
