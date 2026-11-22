import { PlayerScreen } from '@/relisten/player/ui/player_screen';
import { RelistenNavigationProvider } from '@/relisten/util/routes';

export default function Page() {
  return (
    <RelistenNavigationProvider groupSegment="(artists)">
      <PlayerScreen />
    </RelistenNavigationProvider>
  );
}
