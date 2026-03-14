module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            compilationMode: 'infer',
            panicThreshold: 'all_errors',
          },
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
          root: ['.'],
          alias: {
            '@/relisten': './relisten',
            '@/app': './app',
            '@/modules': './modules',
            '@/assets': './assets',
          },
        },
      ],
      'nativewind/babel',
      'react-native-reanimated/plugin',
    ],
  };
};
