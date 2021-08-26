import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {NavigationContainer} from '@react-navigation/native';
import {Text} from 'react-native';

const Tab = createBottomTabNavigator();

export function ArtistScreen() {
  return <Text>hi</Text>;
}

export default function ArtistNavigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="/artist/:id/home" component={ArtistScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
