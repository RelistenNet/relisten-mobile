import { useNavigation } from '@react-navigation/native';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import {
  Animated,
  Platform,
  ScrollViewProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { RelistenBlue } from '../../relisten_blue';
import { RelistenText } from '../relisten_text';
import { ScrollScreen } from './ScrollScreen';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type InjectedScrollProps = Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'>;
const DEFAULT_HEADER_TITLE_REVEAL_DISTANCE = Platform.OS === 'ios' ? 44 : 56;

type DisappearingHeaderScreenProps<TProps extends InjectedScrollProps> = PropsWithChildren<
  {
    ScrollableComponent: React.ComponentType<TProps>;
  } & Omit<TProps, keyof InjectedScrollProps>
>;

export const DisappearingHeaderScreen = <TProps extends InjectedScrollProps>({
  ScrollableComponent,
  ...props
}: DisappearingHeaderScreenProps<TProps>) => {
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const safeAreaInsets = useSafeAreaInsets();

  const scrolling = useMemo(() => new Animated.Value(0), []);
  const measuredHeaderRevealDistance = headerHeight - safeAreaInsets.top;
  const headerRevealDistance =
    measuredHeaderRevealDistance > 0
      ? measuredHeaderRevealDistance
      : DEFAULT_HEADER_TITLE_REVEAL_DISTANCE;

  const headerOpacity = useMemo(
    () =>
      scrolling.interpolate({
        inputRange: [0, headerRevealDistance],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [headerRevealDistance, scrolling]
  );

  useEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: RelistenBlue['900'],
      },
      headerTitle: ({ children }: { children: string }) => {
        return (
          <Animated.View style={{ opacity: headerOpacity }}>
            <RelistenText className="text-xl font-semibold">{children}</RelistenText>
          </Animated.View>
        );
      },
    });
  }, [headerOpacity, navigation]);

  const Component = ScrollableComponent;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrolling.setValue(e.nativeEvent.contentOffset.y);
  };
  const componentProps = {
    ...props,
    onScroll,
    scrollEventThrottle: 16,
  } as Omit<DisappearingHeaderScreenProps<TProps>, 'ScrollableComponent'> & TProps;

  return (
    <ScrollScreen>
      <Component {...componentProps} />
    </ScrollScreen>
  );
};
