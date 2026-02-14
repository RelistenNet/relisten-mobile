import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
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

export default function useCacheAssets() {
  const [isAppReady, setIsAppReady] = useState(false);

  // Load any resources or data that you need prior to rendering the app
  useEffect(() => {
    async function loadResourcesAndDataAsync() {
      try {
        const imageAssets = cacheImages([ToolbarRelisten]);
        const preloadedAssets = await Promise.allSettled(imageAssets);
        for (const result of preloadedAssets) {
          if (result.status === 'rejected') {
            console.warn(result.reason);
          }
        }
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
