
[Splash screen figma](https://www.figma.com/file/BsUI88ruljsC1DorBWVF7a/Expo-App-Icon-%26-Splash-(Community)?type=design&node-id=1-1357&mode=design&t=PXiX4Q4omvLMkFeK-11)

[Icon figma](https://www.figma.com/file/PkZxMeBWGLqp5jLdyw2eKy/iOS-%26-Android-%E2%80%93-App-Icon-Template-(Community)?type=design&node-id=1-3&mode=design&t=J1Ojo9GBnXLvrMaR-11)

# Prod builds

```bash
npx eas-cli@latest
# Need to pass SENTRY_AUTH_TOKEN to have sourcemaps uploaded
env SENTRY_AUTH_TOKEN=(op read "op://Private/Relisten Sentry SaaS/CI org auth token") npx eas build -p ios -e production --local
env SENTRY_AUTH_TOKEN=(op read "op://Private/Relisten Sentry SaaS/CI org auth token") npx eas build -p android -e production --local
```
