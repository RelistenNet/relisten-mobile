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

## iOS Simulator + MCP Workflow
- Native iOS changes (`ios/`, native modules, pods, app config) require a rebuild/install:
  - `npx expo run:ios -d 'iPhone 17 Pro'` (or `yarn ios`).
  - This also starts Metro; that is expected for native rebuild runs.
- JS/TS-only changes usually do not require a native rebuild:
  1. Start Metro for the dev client: `npx expo start --dev-client` (add `--clear` if needed).
  2. Boot/open Simulator (`open -a Simulator` or `mcp__ios-simulator__open_simulator`).
  3. Launch the already-installed app from Simulator. Re-run `expo run:ios` only if the app is missing or native bits changed.
- Log sources:
  - Metro/bundler logs: the terminal running `expo start`.
  - iOS simulator system/app logs: `xcrun simctl spawn booted log stream --style compact --level debug`
  - Note: there is no iOS-simulator MCP tool for live log streaming in this environment.
- Available iOS Simulator MCP controls:
  - Boot/open/query: `mcp__ios-simulator__open_simulator`, `mcp__ios-simulator__get_booted_sim_id`
  - Install/launch: `mcp__ios-simulator__install_app`, `mcp__ios-simulator__launch_app`
  - UI automation: `mcp__ios-simulator__ui_view`, `mcp__ios-simulator__ui_describe_all`, `mcp__ios-simulator__ui_describe_point`, `mcp__ios-simulator__ui_tap`, `mcp__ios-simulator__ui_swipe`, `mcp__ios-simulator__ui_type`
  - Capture artifacts: `mcp__ios-simulator__screenshot`, `mcp__ios-simulator__record_video`, `mcp__ios-simulator__stop_recording`
