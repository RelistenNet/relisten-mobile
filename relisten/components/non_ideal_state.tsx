import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from 'tailwindcss/colors';
import { RelistenText } from './relisten_text';

type NonIdealStateProps = {
  icon?: string; // Make icon optional
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
};

export const NonIdealState = ({
  icon = 'alert-circle-outline', // Default icon
  title,
  description,
  actionText,
  onAction,
}: NonIdealStateProps) => {
  return (
    <View className="flex-1 items-center justify-center pt-6">
      <MaterialCommunityIcons name={icon as any} size={48} color={colors.gray['300']} />
      <RelistenText className="my-2 text-2xl font-bold text-gray-300">{title}</RelistenText>
      <RelistenText className="mb-6 w-1/2 text-center text-base text-gray-300">
        {description}
      </RelistenText>
      {actionText && onAction && (
        <TouchableOpacity onPress={onAction} className="rounded-md bg-blue-500 px-4 py-2">
          <Text className="font-semibold text-white">{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
