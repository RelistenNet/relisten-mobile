# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds Expo Router screens and navigation (`_layout.tsx`, `+not-found.tsx`).
- `relisten/` contains the feature code: `api/`, `components/`, `player/`, `realm/`, `offline/`, `carplay/`.
- `modules/relisten-audio-player/` is the custom native audio player module.
- `android/` and `ios/` include platform-specific native projects.
- Static assets live in `assets/` and global styles in `relisten/global.css`.

## Build, Test, and Development Commands
- `nvm use`: load the repo's Node version (required for `npm`/`npx`).
- `yarn ios` / `yarn android`: run the app on a simulator or device via Expo.
- `yarn web`: start the Expo web build.
- `yarn pods`: install or update CocoaPods for iOS.
- `yarn lint`: run ESLint on `app/` and `relisten/`.
- `yarn ts:check`: run TypeScript type checking.
- `./build_releases.sh`: build production releases with EAS (requires `npx eas-cli@latest`).

Always run `yarn lint` and `yarn ts:check` after making changes to ensure that keep the code clean.

## Coding Style & Naming Conventions
- TypeScript + React Native; keep files ASCII and prefer functional components.
- Indentation: 2 spaces (match existing files).
- Component files use `PascalCase` when appropriate; utilities use `camelCase`.
- Expo Router filenames follow its conventions (`_layout.tsx`, `+not-found.tsx`, `index.tsx`).
- Path aliases: `@/relisten/*`, `@/app/*`, `@/modules/*`, `@/assets/*`.
- Linting is enforced by `eslint.config.mjs`; run `yarn lint` before PRs.

## Testing Guidelines
- No test framework is configured in this repo today.
- Use `yarn ts:check` and `yarn lint` as the default verification steps.
- If you introduce tests, keep them close to the feature and document how to run them.

## Commit & Pull Request Guidelines
- Recent commits are short and informal (e.g., “wip carplay”); there is no strict convention.
- Keep commit messages concise and descriptive.
- PRs should include a clear summary, testing notes (commands run), and screenshots for UI changes.
- Link related issues or Discord discussions when applicable.

## Environment & Setup Tips
- Use Node 22+ (see `.nvmrc`) and Yarn (`yarn` to install dependencies).
- For iOS development, install Xcode and run `yarn pods` after dependency changes.
