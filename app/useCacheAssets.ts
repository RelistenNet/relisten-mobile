import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import * as Font from 'expo-font';
import { Icon } from '@expo/vector-icons/build/createIconSet';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';

function cacheImages(images: Array<string | number>) {
  return images.map((image) => {
    if (typeof image === 'string') {
      return Image.prefetch(image);
    } else {
      return Asset.fromModule(image).downloadAsync();
    }
  });
}

function cacheFonts(fonts: Array<Icon<string, string>['font']>) {
  return fonts.map((font) => Font.loadAsync(font));
}

export default function useCacheAssets() {
  const [isAppReady, setIsAppReady] = useState(false);

  // Load any resources or data that you need prior to rendering the app
  useEffect(() => {
    async function loadResourcesAndDataAsync() {
      try {
        const imageAssets = cacheImages([ToolbarRelisten]);

        const fontAssets = cacheFonts([MaterialIcons.font, MaterialCommunityIcons.font]);

        await Promise.all([...imageAssets, ...fontAssets]);
      } catch (e) {
        // You might want to provide this error information to an error reporting service
        console.warn(e);
      } finally {
        setIsAppReady(true);
      }
    }

    loadResourcesAndDataAsync();
  }, []);

  return isAppReady;
}
