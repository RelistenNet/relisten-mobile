import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Flex from '@/relisten/components/flex';
import PlaybackBar from './PlaybackBar';

export default function TabBar(props: BottomTabBarProps) {
  return (
    <Flex column>
      <PlaybackBar />
      <BottomTabBar {...props} />
    </Flex>
  );
}
