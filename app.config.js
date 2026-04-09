export default ({ config }) => {
  const appVersion = config.version ?? '0.0.0';
  const iosBuildNumber = String(config.ios?.buildNumber ?? '0');
  const androidVersionCode = String(config.android?.versionCode ?? '0');
  const defaultIosRuntimeVersion = `${appVersion}+ios.${iosBuildNumber}`;
  const defaultAndroidRuntimeVersion = `${appVersion}+android.${androidVersionCode}`;

  const runtimeVersionOverride = (envName, fallback) => {
    const value = process.env[envName];
    return value && value.trim().length > 0 ? value : fallback;
  };

  return {
    ...config,
    // Bare workflow doesn't support runtimeVersion policies, so set explicit runtime strings.
    ios: {
      ...config.ios,
      runtimeVersion: runtimeVersionOverride('RELISTEN_IOS_RUNTIME_VERSION', defaultIosRuntimeVersion),
    },
    android: {
      ...config.android,
      runtimeVersion: runtimeVersionOverride('RELISTEN_ANDROID_RUNTIME_VERSION', defaultAndroidRuntimeVersion),
    },
    updates: {
      url: 'https://ota.relisten.net/manifest',
      codeSigningMetadata: {
        keyid: 'main',
        alg: 'rsa-v1_5-sha256',
      },
      codeSigningCertificate: './certs/certificate.pem',
      enabled: true,
      requestHeaders: {
        'expo-channel-name': process.env.RELEASE_CHANNEL,
      },
    },
  };
};
