// https://github.com/uuidjs/uuid#react-native--expo
import 'react-native-get-random-values';
import 'uuid';

import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View} from 'react-native';
import {RelistenApiProvider} from "./relisten/api/context";
import {HomeScreen} from "./relisten/screens/Home";
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from "@react-navigation/native-stack";
import {YearsScreen} from "./relisten/screens/Years";
import {YearShowsScreen} from "./relisten/screens/YearShows";

export type RootStackParamList = {
    Home: undefined;
    Years: {artistId: string};
    YearShows: {artistId: string; yearId: string};
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
    return (
        <NavigationContainer>
            <RelistenApiProvider>
                <Stack.Navigator>
                    <Stack.Screen name="Home" component={HomeScreen} options={{title: "Relisten"}}/>
                    <Stack.Screen name="Years" component={YearsScreen} />
                    <Stack.Screen name="YearShows" component={YearShowsScreen} />
                </Stack.Navigator>
                <StatusBar style="auto"/>
            </RelistenApiProvider>
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        // backgroundColor: 'red',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
