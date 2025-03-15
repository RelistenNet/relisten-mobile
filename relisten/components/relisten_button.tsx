import {
  ActivityIndicator,
  GestureResponderEvent,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import clsx from 'clsx';
import { RelistenText } from './relisten_text';
import React, { useState } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';
import { tw } from '../util/tw';

const buttonVariants = cva('flex-row items-center justify-center border border-transparent', {
  variants: {
    intent: {
      none: 'bg-relisten-blue-800',
      primary: 'bg-relisten-blue-500',
      outline: 'border-white/20',
    },
    disabled: {
      true: 'opacity-40',
    },
    size: {
      default: 'px-4 py-2',
      thin: 'px-1',
      sm: 'h-7 px-3',
      xs: 'px-2 py-0.5 text-xs',
      lg: 'px-8 py-4 text-lg',
      card: 'px-3 py-4',
      icon: 'w-9 px-2 py-1',
    },
    textSize: {
      sm: 'text-sm',
    },
    fill: {
      true: 'w-full',
    },
    rounded: {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      full: 'rounded-full',
    },
    align: {
      left: 'justify-start',
      center: 'justify-center',
      between: 'justify-between',
    },
  },
  defaultVariants: {
    intent: 'none',
    size: 'default',
    align: 'center',
    rounded: 'md',
  },
});

export interface ButtonProps
  extends TouchableOpacityProps,
    Omit<VariantProps<typeof buttonVariants>, 'disabled'> {
  textClassName?: string;
  icon?: React.ReactNode;
  cn?: string;
  automaticLoadingIndicator?: boolean;
  asyncOnPress?: (event: GestureResponderEvent) => Promise<unknown>;
}
export const RelistenButton = React.forwardRef<any, ButtonProps>(
  (
    {
      children,
      cn,
      icon,
      intent,
      rounded,
      textClassName,
      disabled,
      asyncOnPress,
      onPress,
      automaticLoadingIndicator,
      ...props
    },
    ref
  ) => {
    const cls = tw(buttonVariants({ disabled, intent, rounded }), cn);

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const wrappedOnPress = async (event: GestureResponderEvent) => {
      const result = asyncOnPress && asyncOnPress(event);

      if (result) {
        setIsLoading(true);

        try {
          await result;
        } finally {
          setIsLoading(false);
        }
      }
    };

    if (automaticLoadingIndicator && isLoading && !icon) {
      icon = <ActivityIndicator size={8} className="mr-2" />;
      disabled = true;
    }

    return (
      <TouchableOpacity
        ref={ref as any}
        className={cls}
        onPress={asyncOnPress ? wrappedOnPress : onPress}
        {...props}
        disabled={disabled}
      >
        {icon && <View className="pr-1">{icon}</View>}
        <RelistenText className={tw('text-center font-bold', textClassName)}>
          {children}
        </RelistenText>
      </TouchableOpacity>
    );
  }
);
