global.Promise = require('promise')

require('promise/lib/rejection-tracking').enable({
  allRejections: true,
  onUnhandled: (id, error) => {
    console.error(id, error, JSON.stringify(error, null, 2));
  }
});

import {registerRootComponent} from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
