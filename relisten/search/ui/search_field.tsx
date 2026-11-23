import { MaterialIcons } from '@expo/vector-icons';
import { TextInput, TouchableOpacity, View } from 'react-native';

/**
 * The search box. Typing debounces in the session; Return asks for full
 * results right away.
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
  return (
    <View className="mx-4 my-2 flex-row items-center rounded-lg bg-relisten-blue-800 px-3">
      <MaterialIcons name="search" size={20} color="#9ca3af" />
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        className="min-h-11 flex-1 px-2 py-2 text-lg text-white"
        clearButtonMode="never"
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        returnKeyType="search"
        value={value}
      />
      {value.length > 0 && (
        <TouchableOpacity
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center"
          onPress={() => onChangeText('')}
        >
          <MaterialIcons name="cancel" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
  );
}
