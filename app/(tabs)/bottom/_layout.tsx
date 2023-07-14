import { Slot } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function Layout() {
  if (typeof window === 'undefined') return <Slot />;

  const { BottomSheet } =
    require('../../../relisten/layouts/BottomSheetLayout') as typeof import('../../../relisten/layouts/BottomSheetLayout');

  return (
    <BottomSheet
      screenOptions={{
        backgroundStyle: {
          backgroundColor: 'white',
        },
        // API Reference: https://github.com/th3rdwave/react-navigation-bottom-sheet#navigation-options
        // And: https://gorhom.github.io/react-native-bottom-sheet/modal/props/
      }}
    />
  );
}
