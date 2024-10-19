import React from 'react';
import { View } from 'react-native';
import { RelistenApiClientError } from '@/relisten/api/client';
import { RelistenText } from '@/relisten/components/relisten_text';

export const RelistenErrorBox: React.FC<{
  heading?: string;
  title: string;
  description?: string;
}> = ({ heading, title, description }) => {
  return (
    <View className="w-full flex-col rounded-md bg-red-800 p-4">
      <View className="w-full flex-row justify-between">
        {heading && (
          <RelistenText className="font-bold text-gray-200" selectable={false}>
            {heading}
          </RelistenText>
        )}
        <RelistenText className="font-bold text-gray-200" selectable={false}>
          {title}
        </RelistenText>
      </View>
      {description && (
        <RelistenText className="font-ui-monospace pt-2 text-sm text-gray-300">
          {description}
        </RelistenText>
      )}
    </View>
  );
};

export const RelistenError: React.FC<{ error: RelistenApiClientError }> = ({ error }) => {
  if (error.httpError) {
    return (
      <RelistenErrorBox
        heading="Network Error 🙅"
        title={'' + error.httpError.status}
        description={error.httpError.url}
      />
    );
  }

  if (error.error) {
    return (
      <RelistenErrorBox
        heading={error.error.name}
        title={error.error.message}
        description={error.message}
      />
    );
  }

  return <RelistenErrorBox title="Unknown error" />;
};

export const RelistenErrors: React.FC<{ errors?: RelistenApiClientError[] }> = ({ errors }) => {
  if (!errors) {
    return <RelistenErrorBox title="Unknown (missing) error" />;
  }

  return (
    <>
      {errors.map((e, idx) => (
        <View className="pb-2" key={idx}>
          <RelistenError error={e} />
        </View>
      ))}
    </>
  );
};
