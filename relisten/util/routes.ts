import { useSegments } from 'expo-router';

export type RelistenTabGroupSegment = '(downloads)' | '(artists)' | undefined;

export const useRoute = (nextRoute?: string) => {
  const segments = useSegments();

  if (nextRoute) {
    return segments.concat(nextRoute + '/').join('/');
  }

  return segments.join('/');
};

export const useGroupSegment = (fallback?: boolean): RelistenTabGroupSegment => {
  const segments = useSegments();

  const group = segments.at(2);

  if (!group) {
    if (fallback) return '(artists)';
    return undefined;
  }

  return group as RelistenTabGroupSegment;
};

export const useIsDownloadsTab = () => {
  const groupSegment = useGroupSegment();

  return groupSegment === '(downloads)';
};
