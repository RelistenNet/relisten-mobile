import { useNavigation } from '@react-navigation/native';
import React, { PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
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

  const scrolling = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrolling.interpolate({
    inputRange: [0, headerHeight - safeAreaInsets.top],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

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
  }, [headerOpacity]);

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
