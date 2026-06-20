import { Redirect } from 'expo-router';

export default function UserLibraryAuthCallbackRoute() {
  // Placeholder route for provider callbacks. The branch only ships local
  // development auth; production provider handling will consume this surface.
  return (
    <Redirect
      href={{
        pathname: '/relisten/tabs',
        params: { authCallback: 'received' },
      }}
    />
  );
}
