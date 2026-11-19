import { describe, expect, it } from 'vitest';
import { guideLinkAction } from './guide_links';

describe('guideLinkAction', () => {
  it('seeks within another entry', () => {
    expect(guideLinkAction('#entry=playlist_entry_01k8000000e008000000000004&t=1:02:03')).toEqual({
      kind: 'timestamp',
      entryId: 'playlist_entry_01k8000000e008000000000004',
      seconds: 3723,
    });
  });

  it('seeks within the description’s own track', () => {
    expect(guideLinkAction('#t=6:42')).toEqual({ kind: 'timestamp', seconds: 402 });
  });

  it('opens https links', () => {
    expect(guideLinkAction('https://relisten.net')).toEqual({
      kind: 'web',
      url: 'https://relisten.net',
    });
  });

  it.each(['http://example.com', 'mailto:team@relisten.net', 'www.example.com', '#top', '#t=6:4'])(
    'ignores %s',
    (url) => {
      expect(guideLinkAction(url)).toEqual({ kind: 'none' });
    }
  );
});
