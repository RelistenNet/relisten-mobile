export default ({ config }) => ({
  ...config,
  ...{
    updates: {
      // Often update native code between different builds of the same version for Testflight
      runtimeVersion: { policy: 'nativeVersion' },
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
  },
});
