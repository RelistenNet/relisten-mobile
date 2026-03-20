import { Slot } from 'expo-router';
import { RelistenNavigationProvider } from '@/relisten/util/routes';

export default function WebLayout() {
  return (
    <RelistenNavigationProvider groupSegment="(artists)">
      <Slot />
    </RelistenNavigationProvider>
  );
}
