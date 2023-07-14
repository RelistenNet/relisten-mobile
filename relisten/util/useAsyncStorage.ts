/* eslint-disable no-unused-vars */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function useAsyncStorage<T>(
  key: string
): [T | undefined, (data: T) => T, () => void] {
  const [storageItem, setStorageItem] = useState<T>();

  async function getStorageItem() {
    const data = (await AsyncStorage.getItem(key)) as T;

    setStorageItem(data);
  }

  function updateStorageItem(data: T) {
    if (typeof data === 'string') {
      AsyncStorage.setItem(key, data);
      setStorageItem(data);
    }
    return data;
  }

  function clearStorageItem() {
    AsyncStorage.removeItem(key);
    setStorageItem(undefined);
  }

  useEffect(() => {
    getStorageItem();
  }, []);

  return [storageItem, updateStorageItem, clearStorageItem];
}
