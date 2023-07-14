import Flex from '@/relisten/components/flex';
import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

export default function Page() {
  return (
    <Flex center column cn="h-72">
      <Text style={styles.title}>Sheet</Text>
      <Link href="/bottom/" style={styles.subtitle}>
        Close
      </Link>
    </Flex>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 960,
    marginHorizontal: 'auto',
  },
  title: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 36,
    color: '#38434D',
  },
});
