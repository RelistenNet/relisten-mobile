import { MaterialIcons } from '@expo/vector-icons';
import { FC } from 'react';
import { TextProps } from 'react-native';
import Flex from './flex';
import { RelistenText } from './relisten_text';

export const RelistenLink: FC<TextProps> = (props) => {
  return (
    <Flex cn="items-center justify-start">
      <RelistenText selectable={false} {...props}>
        {props.children}
      </RelistenText>
      <RelistenText selectable={false} {...props}>
        <MaterialIcons name="chevron-right" />
      </RelistenText>
    </Flex>
  );
};
