import { describe, expect, it } from 'vitest';
import type { PlaylistRowEntry, PlaylistRowGroup } from './playlist_hooks';
import { downloadedGroups, searchedGroups } from './playlist_group_filters';

function track(entryId: string, title: string, venue: string, note?: string): PlaylistRowEntry {
  return {
    entry: {
      entryId,
      segmentId: 's',
      trackId: `track_${entryId}`,
      rank: entryId,
      description: note,
    },
    descriptionMarkdown: note,
    sourceTrack: {
      title,
      artist: { name: 'Grateful Dead' },
      show: { displayDate: '1977-05-08', venue: { name: venue } },
    } as unknown as PlaylistRowEntry['sourceTrack'],
    status: 'playable',
  };
}

function text(entryId: string, description: string): PlaylistRowEntry {
  return {
    entry: { entryId, segmentId: 's', rank: entryId, description },
    sourceTrack: null,
    status: 'text',
    descriptionMarkdown: description,
  };
}

function group(segmentId: string, entries: PlaylistRowEntry[], intro?: string): PlaylistRowGroup {
  return {
    segment: { segmentId, rank: segmentId, description: intro },
    entries,
    descriptionMarkdown: intro,
  };
}

const entryIds = (groups: PlaylistRowGroup[]) =>
  groups.map((g) => [g.segment.segmentId, g.entries.map((r) => r.entry.entryId)]);

describe('searchedGroups', () => {
  const groups = [
    group(
      'a',
      [
        track('1', 'Scarlet Begonias', 'Barton Hall'),
        track('2', 'Fire on the Mountain', 'Barton Hall'),
      ],
      'The *classic* pairing'
    ),
    group('b', [track('3', 'Morning Dew', 'Winterland', 'Listen for [the build](#t=6:42)')]),
    group('c', [text('4', 'A quiet interlude')]),
    group('d', [], 'Set two opens'),
  ];

  it('keeps everything for a blank query', () => {
    expect(searchedGroups(groups, '  ')).toBe(groups);
  });

  it('matches track titles and keeps the group intro above them', () => {
    const result = searchedGroups(groups, 'scarlet');
    expect(entryIds(result)).toEqual([['a', ['1']]]);
    expect(result[0].descriptionMarkdown).toBe('The *classic* pairing');
  });

  it('shows the whole group when its intro matches, including prose-only groups', () => {
    expect(entryIds(searchedGroups(groups, 'classic'))).toEqual([['a', ['1', '2']]]);
    expect(entryIds(searchedGroups(groups, 'set two'))).toEqual([['d', []]]);
  });

  it('matches venue, date, notes and text blocks, requiring every word', () => {
    expect(entryIds(searchedGroups(groups, 'winterland'))).toEqual([['b', ['3']]]);
    expect(entryIds(searchedGroups(groups, 'the build'))).toEqual([['b', ['3']]]);
    expect(entryIds(searchedGroups(groups, 'interlude'))).toEqual([['c', ['4']]]);
    expect(entryIds(searchedGroups(groups, 'fire 1977-05-08'))).toEqual([['a', ['2']]]);
    expect(searchedGroups(groups, 'fire winterland')).toEqual([]);
  });

  it('ignores Markdown syntax and link targets', () => {
    expect(searchedGroups(groups, '#t=6')).toEqual([]);
    expect(searchedGroups(groups, '*classic*')).toEqual([]);
  });

  it('does not match an intro that Show Downloaded Only hides', () => {
    const downloaded = groups.map((g) => ({
      ...g,
      entries: g.entries.map((row) => ({
        ...row,
        sourceTrack: row.sourceTrack && {
          ...row.sourceTrack,
          offlineInfo: { isPlayableOffline: () => true },
        },
      })) as PlaylistRowEntry[],
    }));
    expect(searchedGroups(downloadedGroups(downloaded), 'classic')).toEqual([]);
  });
});
