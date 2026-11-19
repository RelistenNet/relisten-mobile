import { Alert } from 'react-native';
import {
  SharingError,
  type SharingFailure,
} from '@/relisten/playlists/sharing/playlist_sharing_service';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';

/** Why a playlist someone shared can't be shown: shared by every screen that reads one. */
export const UNAVAILABLE_PLAYLIST: [title: string, detail: string] = [
  'This playlist isn’t available.',
  'Its owner may have made it private.',
];

export const TAKEN_DOWN_PLAYLIST: [title: string, detail: string] = [
  'This playlist can’t be shared.',
  'It was removed from public view after a report. It’s still yours to play and edit.',
];

/**
 * The alert for a sharing failure the listener can act on. Failures not listed
 * here (a dropped connection, a server error) get the caller's "Try again" toast.
 */
const FAILURE_ALERTS: FailureAlerts = {
  unavailable: UNAVAILABLE_PLAYLIST,
  taken_down: ['This playlist isn’t available.', 'It was removed after a report.'],
  full: [
    'Your account is full.',
    'An account can follow up to 500 playlists and hold up to 250. Remove some, then try again.',
  ],
  rate_limited: [
    'You’ve done that several times in the last minute.',
    'Wait a moment, then try again.',
  ],
};

type FailureAlerts = Partial<Record<SharingFailure, [string, string?]>>;

/**
 * The alert for a failed sharing request, if the listener can do something
 * about it. `overrides` replaces a failure's alert where the screen knows
 * more, such as the owner's own taken-down playlist.
 */
export function sharingFailureAlert(error: unknown, overrides: FailureAlerts = {}) {
  const failure = error instanceof SharingError ? error.failure : undefined;
  return failure ? (overrides[failure] ?? FAILURE_ALERTS[failure]) : undefined;
}

/** Explains a failed sharing request: its alert, or else `fallback` as a toast. */
export function explainSharingFailure(
  error: unknown,
  fallback: string,
  overrides: FailureAlerts = {}
) {
  const alert = sharingFailureAlert(error, overrides);
  if (alert) {
    Alert.alert(...alert);
  } else {
    showPlaylistToast(fallback);
  }
}
