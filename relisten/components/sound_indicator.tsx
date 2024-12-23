import LottieView from 'lottie-react-native';
import { useEffect, useRef } from 'react';

export function SoundIndicator({ size, playing }: { size: number; playing: boolean }) {
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (playing) {
      animationRef.current?.play();
    } else {
      animationRef.current?.pause();
    }
  }, [playing]);

  return (
    <LottieView
      ref={animationRef}
      style={{
        width: size,
        height: size,
        backgroundColor: 'transparent',
      }}
      // colorFilters={[{ keypath: 'soundIndicator', color: 'red' }]}
      // from: https://lottiefiles.com/animations/sound-indicator-kRvrZVbrcJ by Jose Vittone
      source={require('../../assets/lottie/sound_indicator.json')}
    />
  );
}
