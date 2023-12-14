import { useNavigation } from '@react-navigation/native';
import React, { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, ScrollViewProps } from 'react-native';
import { RelistenBlue } from '../../relisten_blue';
import { RelistenText } from '../relisten_text';
import { ScrollScreen } from './ScrollScreen';

export const DisappearingHeaderScreen = <
  TProps extends Partial<
    Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle' | 'contentContainerStyle'>
  >,
>({
  headerHeight,
  ScrollableComponent,
  ...props
}: PropsWithChildren<
  {
    headerHeight: number;
    ScrollableComponent: React.ComponentType<TProps>;
  } & TProps
>) => {
  const navigation = useNavigation();

  const scrolling = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrolling.interpolate({
    inputRange: [0, 75],
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

  const Component = ScrollableComponent as any;

  const onScroll = (e: any) => {
    scrolling.setValue(e.nativeEvent.contentOffset.y);
  };

  return (
    <ScrollScreen>
      <Component
        onScroll={onScroll}
        // scrollEventThrottle={16}
        {...props}
      />
    </ScrollScreen>
  );
};
