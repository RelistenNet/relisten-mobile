import {
  MenuView as ExpoMenuView,
  type MenuAction,
  type MenuComponentProps,
} from '@expo/ui/community/menu';
import {
  MenuView as ReactNativeMenuView,
  type MenuAction as ReactNativeMenuAction,
} from '@react-native-menu/menu';
import { Platform } from 'react-native';

export type { MenuAction, MenuComponentProps } from '@expo/ui/community/menu';

const IOS_MENU_ICON_COLOR = '#f8fafc';
const IOS_DESTRUCTIVE_MENU_ICON_COLOR = '#ff453a';

function reactNativeMenuAction(action: MenuAction): ReactNativeMenuAction {
  const imageColor =
    action.imageColor ??
    (action.attributes?.destructive ? IOS_DESTRUCTIVE_MENU_ICON_COLOR : IOS_MENU_ICON_COLOR);

  return {
    attributes: action.attributes,
    displayInline: action.displayInline,
    id: action.id,
    image: typeof action.image === 'string' ? action.image : undefined,
    imageColor,
    state: action.state,
    subactions: action.subactions?.map(reactNativeMenuAction),
    title: action.title,
    titleColor: action.titleColor,
  };
}

export function NativeMenuView({ actions, children, ...props }: MenuComponentProps) {
  if (Platform.OS === 'ios') {
    return (
      <ReactNativeMenuView
        actions={actions.map(reactNativeMenuAction)}
        themeVariant="dark"
        {...props}
      >
        {children}
      </ReactNativeMenuView>
    );
  }

  return (
    <ExpoMenuView actions={actions} {...props}>
      {children}
    </ExpoMenuView>
  );
}
