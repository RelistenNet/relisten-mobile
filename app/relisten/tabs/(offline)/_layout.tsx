import TabRootStackLayout, {
  unstable_settings,
} from '@/relisten/pages/tab_roots/TabRootStackLayout';
import { RelistenNavigationProvider } from '@/relisten/util/routes';

export { unstable_settings };

export default function OfflineTabLayout() {
  return (
    <RelistenNavigationProvider groupSegment="(offline)">
      <TabRootStackLayout />
    </RelistenNavigationProvider>
  );
}
