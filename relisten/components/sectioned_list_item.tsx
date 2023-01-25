import { StyleSheet } from 'react-native';
import React, { PropsWithChildren } from 'react';
import { ListItem, ListItemProps } from 'react-native-ui-lib';

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    // width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 'auto',
  },
});

export const SectionedListItem: React.FC<PropsWithChildren<ListItemProps>> = ({
  children,
  ...props
}) => {
  return (
    <ListItem style={[styles.container, props.style]} {...props}>
      {children}
    </ListItem>
  );
};
