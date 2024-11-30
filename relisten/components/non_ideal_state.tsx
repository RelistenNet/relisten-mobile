import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RelistenButton } from './relisten_button';
import { RelistenText } from './relisten_text';

type NonIdealStateProps = {
  icon?: string; // Make icon optional
  title: React.ReactNode;
  description: React.ReactNode;
  actionText?: React.ReactNode;
  onAction?: () => void;
};

export const NonIdealState = ({
  icon = 'warning', // Default icon
  title,
  description,
  actionText,
  onAction,
}: NonIdealStateProps) => {
  return (
    <View className="flex-1 items-center justify-center pb-2 pt-6">
      <MaterialIcons name={icon as any} size={32} color={colors.gray['200']} />
      <RelistenText className="my-1 text-3xl font-bold text-gray-200">{title}</RelistenText>
      <RelistenText className="w-1/2 text-center text-gray-400">{description}</RelistenText>
      {actionText && onAction && (
        <RelistenButton onPress={onAction} intent="primary" cn="mt-4">
          <Text className="font-semibold text-white">{actionText}</Text>
        </RelistenButton>
      )}
    </View>
  );
};
