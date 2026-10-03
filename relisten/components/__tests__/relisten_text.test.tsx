import { fireEvent, render, screen } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { RelistenText } from '../relisten_text';

describe('RelistenText', () => {
  it('renders its children as visible text', async () => {
    await render(<RelistenText>Hello Relisten</RelistenText>);

    expect(screen.getByText('Hello Relisten')).toBeOnTheScreen();
  });

  it('calls onPress when the text is pressed', async () => {
    const onPress = vi.fn();

    await render(<RelistenText onPress={onPress}>Hello Relisten</RelistenText>);

    await fireEvent.press(screen.getByText('Hello Relisten'));

    expect(onPress).toHaveBeenCalledOnce();
  });

  it('makes text selectable by default', async () => {
    await render(<RelistenText testID="relisten-text">Hello Relisten</RelistenText>);

    expect(screen.getByTestId('relisten-text')).toHaveProp('selectable', true);
  });

  it('allows text selection to be disabled', async () => {
    await render(
      <RelistenText testID="relisten-text" selectable={false}>
        Hello Relisten
      </RelistenText>
    );

    expect(screen.getByTestId('relisten-text')).toHaveProp('selectable', false);
  });
});
