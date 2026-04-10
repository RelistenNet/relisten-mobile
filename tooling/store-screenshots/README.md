# Store Screenshot Generator

Generates composed App Store / Play Store screenshots from raw app screenshots.

The current template keeps the Relisten release style:

- Relisten blue vertical gradient: `#008AB0` to `#00ACDB`
- `Stay Retro` headline font
- large white centered copy
- Apple iPhone 17 Pro and iPad Pro 13" bezel artwork, plus a Pixel 7a style frame
- bottom-cropped device placement so the screenshots can stay large while the tab bar remains partly visible
- one output image per raw screenshot, per platform

## Usage

Put raw screenshots here:

```sh
~/Downloads/relisten-store-shots/ios/01.PNG
~/Downloads/relisten-store-shots/ios/02.PNG
~/Downloads/relisten-store-shots/ios/03.PNG
~/Downloads/relisten-store-shots/ios/04.PNG
~/Downloads/relisten-store-shots/ios/05.PNG

~/Downloads/relisten-store-shots/ipados/01.png
~/Downloads/relisten-store-shots/ipados/02.png
~/Downloads/relisten-store-shots/ipados/03.png
~/Downloads/relisten-store-shots/ipados/04.png
~/Downloads/relisten-store-shots/ipados/05.png

~/Downloads/relisten-store-shots/android/01.png
~/Downloads/relisten-store-shots/android/02.png
~/Downloads/relisten-store-shots/android/03.png
~/Downloads/relisten-store-shots/android/04.png
~/Downloads/relisten-store-shots/android/05.png
```

Generate everything:

```sh
yarn store:screenshots
```

Outputs are written to:

```sh
dist/store-screenshots/ios/
dist/store-screenshots/ipados/
dist/store-screenshots/android/
```

Generate only one platform:

```sh
yarn store:screenshots -- --platform ios
yarn store:screenshots -- --platform ipados
yarn store:screenshots -- --platform android
```

Use a different screenshot folder:

```sh
yarn store:screenshots -- --input ~/Downloads/other-shots
```

Use a different output folder:

```sh
yarn store:screenshots -- --output ~/Desktop/relisten-store-export
```

## Editing The Template

Most changes should happen in `config.json`:

- Update the headline copy in `screens`.
- Adjust `canvasWidth` / `canvasHeight` for store target sizes.
- Change `deviceWidthRatio` to make the phone larger or smaller.
- Change `deviceBorderRatio` to make the device bezel thicker or thinner.
- Use `deviceBottomMarginRatio` to crop the device into the bottom edge. Negative values move the phone below the canvas.
- Use `frameImagePath` and `frameScreenRect` to swap in real transparent bezel artwork.
- The headline is automatically centered in the space between the top edge and the phone.
- Use `textVerticalOffsetRatio` only for small manual nudges after that centering.
- Change `textHeightRatio` to give the headline more or less vertical room.
- Change `gradientTop` / `gradientBottom` to update the background.

The generator intentionally uses macOS Swift/AppKit instead of an npm image dependency, so it can run locally without adding a heavy native package to the React Native app.
