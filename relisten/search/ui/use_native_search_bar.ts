import { useEffect, useMemo, useRef } from 'react';
import type { SearchBarCommands, SearchBarProps } from 'react-native-screens';
import { RelistenBlue } from '@/relisten/relisten_blue';

/**
 * Options for the system search bar (`UISearchController`) in a screen's
 * header. Typing debounces in the session; the keyboard's Search button asks
 * for full results right away.
 *
 * The native bar owns its text, the way an uncontrolled input does: the
 * screen is told about typing and never writes the text back. It writes the
 * bar only when the query changes from outside it, such as a tour narrowing
 * that replaces the query. On iOS a written text doesn't come back as typing.
 * Android hasn't been checked and may report it.
 *
 * The options object stays the same across renders while the placeholder
 * does, because the header copies every new object to the native bar.
 */
export function useNativeSearchBar({
  value,
  placeholder,
  focusOnMount = false,
  placement,
  onChangeText,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  /** Focus the bar once it is on screen, as Add Tracks does when it opens. */
  focusOnMount?: boolean;
  placement?: SearchBarProps['placement'];
  onChangeText: (text: string) => void;
  onSubmit: () => void;
}): SearchBarProps {
  const barRef = useRef<SearchBarCommands>(null);
  // The last text the bar reported. The session takes it in the same event,
  // so a `value` that differs came from outside the bar.
  const textFromBar = useRef(value);
  // The memoized options call the latest handlers through this ref.
  const handlers = useRef({ onChangeText, onSubmit });

  useEffect(() => {
    handlers.current = { onChangeText, onSubmit };
  });

  useEffect(() => {
    if (value !== textFromBar.current) {
      textFromBar.current = value;
      barRef.current?.setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (!focusOnMount) {
      return;
    }

    // The header mounts the bar after the screen, and the bar can't take
    // focus until the sheet has finished sliding in. Measured on the iOS 27
    // simulator: 400 ms was too early, 800 ms works.
    const timer = setTimeout(() => barRef.current?.focus(), 800);
    return () => clearTimeout(timer);
  }, [focusOnMount]);

  return useMemo((): SearchBarProps => {
    const reportTyping = (text: string) => {
      textFromBar.current = text;
      handlers.current.onChangeText(text);
    };

    return {
      ref: barRef,
      placeholder,
      placement,
      autoCapitalize: 'none',
      // Results update as you type, so they stay visible under the bar.
      obscureBackground: false,
      hideNavigationBar: false,
      hideWhenScrolling: false,
      tintColor: 'white',
      textColor: 'white',
      barTintColor: RelistenBlue[800],
      onChangeText: (event) => reportTyping(event.nativeEvent.text),
      // iOS empties the field on Cancel without a change event.
      onCancelButtonPress: () => reportTyping(''),
      onSearchButtonPress: () => handlers.current.onSubmit(),
    };
  }, [placeholder, placement]);
}
