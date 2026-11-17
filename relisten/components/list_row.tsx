import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import React, { type ReactNode } from 'react';
import { TouchableOpacity, type TouchableOpacityProps, View } from 'react-native';

type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;

/**
 * A list row with the same height, padding, and type as the playlist rows: a
 * title, an optional grey subtitle, and a grey › on the right when it opens
 * something. Rows built from it line up wherever they sit together.
 */
export const ListRow = React.forwardRef<
  TouchableOpacityRef,
  TouchableOpacityProps & {
    title: string;
    subtitle?: string;
    subtitleClassName?: string;
    /** Shown right after the title, e.g. a playlist's downloaded mark. */
    accessory?: ReactNode;
    disclosure?: boolean;
  }
>(({ title, subtitle, subtitleClassName, accessory, disclosure = true, ...props }, ref) => {
  const content = (
    <>
      <View className="min-w-0 flex-1">
        <RelistenText className="text-lg font-semibold" numberOfLines={2} selectable={false}>
          {title}
        </RelistenText>
        {subtitle !== undefined && (
          <RelistenText
            className={tw('text-sm text-gray-400', subtitleClassName)}
            selectable={false}
          >
            {subtitle}
          </RelistenText>
        )}
      </View>
      {accessory}
      {disclosure && (
        <RelistenText className="ml-2 text-lg text-gray-400" selectable={false}>
          ›
        </RelistenText>
      )}
    </>
  );

  const className = tw('min-h-[56px] flex-row items-center px-4 py-3', {
    'opacity-40': props.disabled,
  });
  if (!props.onPress && !disclosure) {
    return <View className={className}>{content}</View>;
  }
  return (
    <TouchableOpacity
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      className={className}
      {...props}
    >
      {content}
    </TouchableOpacity>
  );
});

ListRow.displayName = 'ListRow';
