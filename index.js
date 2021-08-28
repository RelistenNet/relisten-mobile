/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './RelistenApp';
import {openConnection} from './app/db/database';

AppRegistry.registerComponent('RelistenApp', () => App);

setTimeout(async () => {
  try {
    await openConnection();
  } catch (e) {
    console.error(e);
    throw e;
  }
}, 10000);
