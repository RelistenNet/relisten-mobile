import { useNetInfo } from '@react-native-community/netinfo';

export function useShouldMakeNetworkRequests(): boolean {
  const { type } = useNetInfo();

  return type != 'none';
}
