export default ({ config }) => {
  const appVersion = config.version ?? '0.0.0';
  const iosBuildNumber = String(config.ios?.buildNumber ?? '0');
  const androidVersionCode = String(config.android?.versionCode ?? '0');

  return {
    ...config,
    // Bare workflow doesn't support runtimeVersion policies, so set explicit runtime strings.
    ios: {
      ...config.ios,
      runtimeVersion: `${appVersion}+ios.${iosBuildNumber}`,
    },
    android: {
      ...config.android,
      runtimeVersion: `${appVersion}+android.${androidVersionCode}`,
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
