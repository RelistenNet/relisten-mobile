import { createElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');
const native = vi.hoisted(() => ({
  button: undefined as
    | undefined
    | { onPress(event: unknown): Promise<unknown>; accessibilityRole: string; disabled: boolean },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  ActivityIndicator: () => null,
  View: ({ children }: { children: ReactNode }) => children,
  Text: ({ children, selectable }: { children: ReactNode; selectable?: boolean }) =>
    createElement('span', { 'data-selectable': String(selectable) }, children),
  TouchableOpacity: (props: NonNullable<typeof native.button> & { children: ReactNode }) => {
    native.button = props;
    return props.children;
  },
}));
vi.mock('react-native-popover-view', () => ({ default: () => null }));
vi.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

import { ProviderButton } from './provider_button';

describe('provider sign-in buttons', () => {
  it.each(['apple', 'google'] as const)(
    'keeps the %s label nonselectable and forwards the native press to sign-in',
    async (provider) => {
      const signIn = vi.fn().mockResolvedValue(undefined);
      const html = renderToStaticMarkup(
        createElement(ProviderButton, { provider, onPress: signIn })
      );
      expect(html).toContain('data-selectable="false"');
      expect(html).not.toContain('data-selectable="true"');
      expect(native.button?.accessibilityRole).toBe('button');
      expect(native.button?.disabled).toBe(false);
      await native.button!.onPress({});
      expect(signIn).toHaveBeenCalledOnce();
    }
  );
});
