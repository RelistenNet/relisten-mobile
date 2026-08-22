import type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';

const PROVIDER_PRESENTATION = {
  apple: {
    icon: 'apple' as const,
    label: 'Continue with Apple',
  },
  google: {
    icon: 'google' as const,
    label: 'Continue with Google',
  },
};

type ProviderButtonProps = {
  disabled?: boolean;
  opening?: boolean;
  onPress: () => Promise<unknown>;
  provider: AccountProvider;
};

export function ProviderButton({
  disabled = false,
  opening = false,
  onPress,
  provider,
}: ProviderButtonProps) {
  const presentation = PROVIDER_PRESENTATION[provider];

  return (
    <RelistenButton
      accessibilityLabel={presentation.label}
      automaticLoadingIndicator
      className="border border-white/20 bg-white"
      disabled={disabled}
      icon={<MaterialCommunityIcons color="#111827" name={presentation.icon} size={20} />}
      textClassName="text-black"
      asyncOnPress={onPress}
      fill
      size="lg"
    >
      {opening ? 'Opening sign in...' : presentation.label}
    </RelistenButton>
  );
}
