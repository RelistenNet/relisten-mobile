import { RelistenText } from '@/relisten/components/relisten_text';
import { useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { artistUuid, venueUuid } = useLocalSearchParams();

  return (
    <>
      <RelistenText>Artist uuid: {artistUuid}</RelistenText>
      <RelistenText>Venue uuid: {venueUuid}</RelistenText>
    </>
  );
}
