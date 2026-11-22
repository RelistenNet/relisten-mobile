import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ router: { push } }));
vi.mock('@/relisten/util/routes', () => ({ useGroupSegment: () => '(artists)' }));
vi.mock('@/relisten/components/menus/native_menu_icons', () => ({ nativeMenuIcons: {} }));

import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { TrackNavigationProvider, useGoToSong } from './track_navigation';

const scarlet = {
  artistUuid: 'gd',
  normalization: { parts: [{ ordinal: 1, song: { id: 'song_scarlet', name: 'Scarlet' } }] },
} as unknown as SourceTrack;

/** Renders a menu's hook under `wrap` and returns what it offers. */
type GoToSong = ReturnType<typeof useGoToSong>;

function Menu({ report }: { report: (menu: GoToSong) => void }) {
  report(useGoToSong(scarlet));
  return null;
}

function goToSongIn(wrap: (child: ReactElement) => ReactElement): GoToSong {
  const report = vi.fn<(menu: GoToSong) => void>();
  renderToStaticMarkup(wrap(createElement(Menu, { report })));
  return report.mock.lastCall![0];
}

describe('Go to Song inside the player', () => {
  it('leaves through the provided step (closing the player) before opening the song', () => {
    const closeThen = vi.fn<(navigate: () => void) => void>();
    const menu = goToSongIn((child) =>
      createElement(TrackNavigationProvider, { beforeNavigate: closeThen }, child)
    );

    const goToScarlet = menu.actions.find((action) => action.title === 'Go to Scarlet');
    menu.handleAction(goToScarlet!.id!);
    expect(push).not.toHaveBeenCalled();

    closeThen.mock.lastCall![0]();
    expect(push).toHaveBeenCalledWith({
      pathname: '/relisten/tabs/(artists)/[artistUuid]/song/[songUuid]/',
      params: { artistUuid: 'gd', songUuid: 'song_scarlet' },
    });
  });
});
