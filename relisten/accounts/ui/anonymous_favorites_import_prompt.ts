import { Alert } from 'react-native';

type AnonymousFavoritesImportPromptOptions = {
  count: number;
  onDefer: () => void | Promise<void>;
  onImport: () => void | Promise<void>;
  username: string;
};

export function showAnonymousFavoritesImportPrompt({
  count,
  onDefer,
  onImport,
  username,
}: AnonymousFavoritesImportPromptOptions) {
  const noun = count === 1 ? 'favorite' : 'favorites';

  Alert.alert(
    `Add ${count} ${noun} to @${username}?`,
    'This copies the favorites saved on this device. They will also remain available when you use Relisten without an account.',
    [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => {
          void onDefer();
        },
      },
      {
        text: 'Add to account',
        onPress: () => {
          void onImport();
        },
      },
    ]
  );
}
