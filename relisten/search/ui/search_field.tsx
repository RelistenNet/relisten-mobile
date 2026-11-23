import { MaterialIcons } from '@expo/vector-icons';
import { type ComponentRef, useRef, useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';

/**
 * The search box. Typing debounces in the session; Return asks for full
 * results right away.
 *
 * The native input owns its text. A controlled `value` would be written back
 * on every render, and a render that lands late (a large result list, or the
 * on-device search) would replace letters typed meanwhile. So the field only
 * reports typing, and it rewrites the input only when the query changes from
 * outside: the clear button, or a narrowing that replaces the query.
 */
export function SearchField({
  value,
  placeholder,
  autoFocus = false,
  onChangeText,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // The last text this field reported. The session takes it in the same
  // event, so any other `value` came from outside the field.
  const [reported, setReported] = useState(value);
  const [inputKey, setInputKey] = useState(0);

  if (value !== reported) {
    // A new key remounts the input with the outside query as its text.
    setReported(value);
    setInputKey((key) => key + 1);
  }

  const report = (text: string) => {
    setReported(text);
    onChangeText(text);
  };

  return (
    <View className="mx-4 my-2 flex-row items-center rounded-lg bg-relisten-blue-800 px-3">
      <MaterialIcons name="search" size={20} color="#9ca3af" />
      <TextInput
        key={inputKey}
        ref={inputRef}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus && inputKey === 0}
        className="min-h-11 flex-1 px-2 py-2 text-lg text-white"
        clearButtonMode="never"
        defaultValue={value}
        onChangeText={report}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center"
          onPress={() => {
            // Clears in place, so the keyboard stays up for the next search.
            inputRef.current?.clear();
            report('');
          }}
        >
          <MaterialIcons name="cancel" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
  );
}
