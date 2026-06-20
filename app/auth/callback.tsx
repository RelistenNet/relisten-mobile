import { Redirect } from 'expo-router';

export default function UserLibraryAuthCallbackRoute() {
  return (
    <Redirect
      href={{
        pathname: '/relisten/tabs',
        params: { authCallback: 'received' },
      }}
    />
  );
}
