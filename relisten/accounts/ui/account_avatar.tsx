import { MaterialIcons } from '@expo/vector-icons';

/**
 * The account's mark. Relisten has no profile photos, so this is the same
 * account icon for everyone rather than an initial pretending to be a photo.
 */
export function AccountAvatar({ size }: { username?: string; size: number }) {
  return (
    <MaterialIcons
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      color="white"
      name="account-circle"
      size={size}
    />
  );
}
