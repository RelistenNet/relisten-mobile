# Relisten Mobile

This is the Relisten v6 app. It is written on top of react native, typescript, and expo. It is designed to run on both Android and iOS, including native modules for each platform to handle gapless audio playback and track management. It is currently available on both the Play Store and the Apple App Store.

### Contributing

Relisten Mobile is licensed under AGPLv3 - and we welcome contributions. If you are interested in contributing, the best way to get started is to [join our Discord](https://relisten.net/discord) and say hello in the #new-contributors channel. Here you can get help setting up the repository and figuring out what might be worthwhile to work on. In general, we graciously welcome contributions, but we also maintain some level of control over the feature-set and code quality, so it's always worth checking in with us before writing code.

### Running the app locally

If you are on a Mac and would like to get the app running locally on iOS simulator, please:

1. Install nodejs and yarn
2. Follow these steps https://docs.expo.dev/workflow/ios-simulator to install XCode and XCode Command Line Tools
3. `npx expo run:ios -d`

There's some more steps - we'll update this README with more instructions as we help people onboard. If you are getting set up yourself, consider taking notes and sending a PR to improve this documentation - thanks!!

### Figma

[Splash screen figma](https://www.figma.com/file/BsUI88ruljsC1DorBWVF7a/Expo-App-Icon-%26-Splash-(Community)?type=design&node-id=1-1357&mode=design&t=PXiX4Q4omvLMkFeK-11)

[Icon figma](https://www.figma.com/file/PkZxMeBWGLqp5jLdyw2eKy/iOS-%26-Android-%E2%80%93-App-Icon-Template-(Community)?type=design&node-id=1-3&mode=design&t=J1Ojo9GBnXLvrMaR-11)

### Prod builds

```bash
npx eas-cli@latest

./build_releases.sh
```
