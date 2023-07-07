import Promise from 'bluebird';
import { RealmProvider } from './relisten/realm/schema';
import Test from './relisten/screens/Test';

if (__DEV__) {
  // replace global promise with Bluebird
  global.Promise = Promise as any;
}

export default function App() {
  return (
    <RealmProvider>
      <Test />
    </RealmProvider>
  );
}
