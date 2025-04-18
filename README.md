# Relisten Mobile

This is the Relisten v6 app. It is written on top of react native, typescript, and expo. It is designed to run on both Android and iOS, including native modules for each platform to handle gapless audio playback and track management. It is currently available on both the Play Store and the Apple App Store.

### Contributing

Relisten Mobile is licensed under AGPLv3 - and we welcome contributions. If you are interested in contributing, the best way to get started is to [join our Discord](https://relisten.net/discord) and say hello in the #new-contributors channel. Here you can get help setting up the repository and figuring out what might be worthwhile to work on. In general, we graciously welcome contributions, but we also maintain some level of control over the feature-set and code quality, so it's always worth checking in with us before writing code.

To keep the code base clean, use the steps below to run locally and verify your changes. Also, before checking in code and creating Pull Requests, run `yarn lint` to make sure your new code does not throw any new `lint` errors.

### Running the app locally

#### Mac + iOS Simulator

If you are on a Mac and would like to get the app running locally on iOS simulator, please:

1. Clone this repository and `cd` into it
1. Install [nodejs](https://nodejs.org/en/download) and yarn
  - We recommend installing nodejs 22 or more recent via nvm (`nvm use` to use version 22 from `.nvmrc`)
  - To install yarn: `npm install --global yarn && yarn`
2. Follow these steps https://docs.expo.dev/workflow/ios-simulator to install XCode and XCode Command Line Tools
4. Update your cocoapods: `npx pod-install` (or `yarn pods`)
3. `npx expo run:ios -d` (or `yarn ios`) and select which Simulator you would like to run on
4. You may have to hit the `r` key once the Simulator runs, it should bundle the application and render

There's some more steps - we'll update this README with more instructions as we help people onboard. If you are getting set up yourself, consider taking notes and sending a PR to improve this documentation - thanks!!

#### Mac + Android

TODO

#### Windows

TODO

### Figma

[Splash screen figma](https://www.figma.com/file/BsUI88ruljsC1DorBWVF7a/Expo-App-Icon-%26-Splash-(Community)?type=design&node-id=1-1357&mode=design&t=PXiX4Q4omvLMkFeK-11)

[Icon figma](https://www.figma.com/file/PkZxMeBWGLqp5jLdyw2eKy/iOS-%26-Android-%E2%80%93-App-Icon-Template-(Community)?type=design&node-id=1-3&mode=design&t=J1Ojo9GBnXLvrMaR-11)

### Prod builds

```bash
npx eas-cli@latest

./build_releases.sh
```
