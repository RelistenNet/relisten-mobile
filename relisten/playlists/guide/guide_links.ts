import { isHttpsLink, isTimestamp, timestampSeconds } from './guide_markdown';

/**
 * What tapping a guide link does. Sanitized descriptions only contain the two
 * link forms the sanitizer keeps, but the renderer also turns bare URLs and
 * e-mail addresses into links on its own, so this is a second allowlist:
 * anything that isn't one of these forms does nothing.
 */
export type GuideLinkAction =
  /** Seek to `seconds` in `entryId`, or in the description's own track when absent. */
  | { kind: 'timestamp'; entryId?: string; seconds: number }
  | { kind: 'web'; url: string }
  | { kind: 'none' };

const TIMESTAMP_LINK = /^#(?:entry=(playlist_entry_[0-9a-z]{26})&)?t=(.*)$/;

export function guideLinkAction(url: string): GuideLinkAction {
  const timestamp = TIMESTAMP_LINK.exec(url);
  if (timestamp && isTimestamp(timestamp[2])) {
    return {
      kind: 'timestamp',
      entryId: timestamp[1],
      seconds: timestampSeconds(timestamp[2]),
    };
  }
  return isHttpsLink(url) ? { kind: 'web', url } : { kind: 'none' };
}
