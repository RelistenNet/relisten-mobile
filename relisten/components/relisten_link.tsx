import { TextProps, View } from 'react-native';
import { RelistenText } from './relisten_text';
import { MaterialIcons } from '@expo/vector-icons';
import { FC } from 'react';

export const RelistenLink: FC<TextProps> = (props) => {
  return (
    <View className="flex-row items-center justify-start">
      <RelistenText selectable={false} {...props}>
        {props.children}
      </RelistenText>
      <RelistenText selectable={false} {...props}>
        <MaterialIcons name="chevron-right" />
      </RelistenText>
    </View>
  );
};
