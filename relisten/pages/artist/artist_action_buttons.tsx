import { Artist } from '@/relisten/realm/models/artist';
import { useWindowDimensions, View } from 'react-native';
import { Link } from 'expo-router';
import { RelistenButton } from '@/relisten/components/relisten_button';
import React from 'react';
import { tw } from '@/relisten/util/tw';

export function ArtistActionButtons({
  currentRoute,
  artist,
  goToRandomShow,
}: {
  currentRoute: string;
  artist: Artist;
  goToRandomShow: () => Promise<void>;
}) {
  const { fontScale } = useWindowDimensions();

  const rowCount = fontScale > 1.25 ? 3 : 2;
  const buttonsPerRow = rowCount === 3 ? 2 : 3;
  const basis = `basis-1/${buttonsPerRow}`;

  const buttons: React.JSX.Element[] = [
    <Link
      key="venues"
      href={{
        pathname: currentRoute + '/venues',
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <RelistenButton
        className={tw(`grow shrink`, basis)}
        textClassName="text-l"
        disabled={!(artist.features().per_source_venues || artist.features().per_show_venues)}
        disabledPopoverText="Venues feature not available for this artist"
      >
        Venues
      </RelistenButton>
    </Link>,
    <Link
      key="tours"
      href={{
        pathname: currentRoute + '/tours',
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <RelistenButton
        className={tw(`grow shrink`, basis)}
        textClassName="text-l"
        disabled={!artist.features().tours}
        disabledPopoverText="Tours feature not available for this artist"
      >
        Tours
      </RelistenButton>
    </Link>,
    <Link
      key="songs"
      href={{
        pathname: currentRoute + '/songs',
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <RelistenButton
        className={tw(`grow shrink`, basis)}
        textClassName="text-l"
        disabled={!artist.features().songs}
        disabledPopoverText="Songs feature not available for this artist"
      >
        Songs
      </RelistenButton>
    </Link>,
    <Link
      key="top"
      href={{
        pathname: currentRoute + '/rated',
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <RelistenButton
        className={tw(`grow shrink`, basis)}
        textClassName="text-l"
        disabled={!artist.features().ratings}
        disabledPopoverText="Top Rated feature not available for this artist"
      >
        Top Rated
      </RelistenButton>
    </Link>,
    <Link
      key="recent"
      href={{
        pathname: currentRoute + '/recent',
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <RelistenButton className={tw(`grow shrink`, basis)} textClassName="text-l">
        Recent
      </RelistenButton>
    </Link>,
    <RelistenButton
      key="random"
      className={tw(`grow shrink`, basis)}
      textClassName="text-l"
      automaticLoadingIndicator
      asyncOnPress={goToRandomShow}
    >
      Random
    </RelistenButton>,
  ];

  const rows: React.JSX.Element[] = [];

  for (let i = 0; i < rowCount; i++) {
    const rowButtons: React.JSX.Element[] = [];

    for (let j = 0; j < buttonsPerRow; j++) {
      const buttonIdx = i * buttonsPerRow + j;
      const button = buttons[buttonIdx];

      rowButtons.push(button);
    }

    rows.push(
      <View key={`row-${i}`} className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
        {rowButtons}
      </View>
    );
  }

  return <>{rows}</>;
}
