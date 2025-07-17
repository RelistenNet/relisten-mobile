# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `yarn ios` (iOS simulator) or `yarn android` (Android)
- **Lint code**: `yarn lint` - Check ESLint errors before committing
- **Type check**: `yarn ts:check` - Run TypeScript compiler for type checking
- **Update CocoaPods**: `yarn pods` - Update iOS dependencies

## Build and Release

- **Production builds**: `./build_releases.sh` - Builds for both iOS and Android using EAS CLI
- **EAS build tool**: `npx eas-cli@latest` - Expo Application Services CLI for production builds

## Architecture Overview

### Tech Stack
- **React Native** with **Expo** (SDK 53+)
- **TypeScript** with strict mode enabled
- **Realm Database** for local data persistence and caching
- **NativeWind** (Tailwind CSS for React Native) for styling
- **Expo Router** for file-based navigation

### Project Structure

#### Core Directories
- `app/` - Expo Router pages and navigation structure
- `relisten/` - Main application code organized by feature
- `modules/relisten-audio-player/` - Custom native module for gapless audio playback
- `android/` & `ios/` - Platform-specific native code

#### Key Components (`relisten/`)
- `api/` - API client with caching, retry logic, and Wretch HTTP library
- `realm/` - Database models, repositories, and network-backed behaviors
- `player/` - Audio player state management and UI components
- `components/` - Reusable UI components following design system patterns
- `offline/` - Download manager for offline listening

### Audio Architecture
The app features a custom native audio player (`RelistenAudioPlayer`) that provides:
- Gapless playback between tracks
- Background audio support with lock screen controls
- Progressive download with streaming cache
- Cross-platform iOS/Android implementation

### Data Layer
**Realm Database** serves as the single source of truth with:
- Network-backed behaviors that sync API data with local cache
- Repository pattern for data access
- Automatic ETags and cache invalidation
- Offline-first architecture

### Path Aliases (tsconfig.json)
- `@/relisten/*` → `./relisten/*`
- `@/app/*` → `./app/*`
- `@/modules/*` → `./modules/*`
- `@/assets/*` → `./assets/*`

## Important Notes

- **Node.js version**: Use Node 22+ (see `.nvmrc`)
- **Package manager**: Yarn is required, not npm
- **Linting**: Always run `yarn lint` before committing
- **Native builds**: Use EAS CLI for production builds, not `expo build`
- **Audio player**: Custom native module handles all playback - do not modify without understanding iOS/Android implementations

## Development Setup

1. Install Node.js 22+ and Yarn
2. Run `yarn` to install dependencies
3. For iOS: Install Xcode and run `yarn pods`
4. Start development: `yarn ios` or `yarn android`