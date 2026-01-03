# Last.fm Scrobbling + Now Playing Design

## Goals
- Allow users to connect their Last.fm account and enable scrobbling.
- Update Now Playing when a track starts, and scrobble on completion.
- Keep credentials secure and minimize exposure in a FOSS repo.
- Be resilient to offline playback and network interruptions.

## Non-Goals
- Supporting multiple Last.fm accounts per device.
- Exposing playback history management beyond scrobble submission.

## User Journeys

### 1) First-time enable
1. User opens Settings.
2. Sees "Last.fm Scrobbling" section with an "Enable" button.
3. Taps Enable -> opens Last.fm web auth flow.
4. Approves Relisten.
5. Returns to app -> "Connected as <username>" and toggle is ON.
6. Playback begins -> Now Playing updates on track start -> scrobble submitted on completion.

### 2) Disabled state
1. User toggles OFF.
2. App stops submitting Now Playing / scrobbles.
3. Session key remains stored until "Disconnect".

### 3) Disconnect / revoke
1. User taps "Disconnect".
2. App deletes session key locally.
3. UI reverts to "Enable" flow.

### 4) Offline playback
1. User plays a track with no network.
2. App queues scrobble locally with timestamp.
3. When connectivity returns, app flushes queue.

### 5) Token/session issues
1. Session invalid or rejected by Last.fm.
2. App prompts user to re-auth.
3. Queued scrobbles are held until re-auth or user cancels.

### 6) Remote revoke
1. User revokes Relisten access on last.fm.
2. Next API call returns auth error.
3. App marks auth invalid, stops submissions, and prompts reconnect in Settings.

### 7) Account switch
1. User taps Disconnect.
2. App clears session key and any queued scrobbles tied to the old account.
3. User re-auths with a new account.

### 8) Metadata gaps
1. Track missing artist/title/album metadata.
2. App skips now playing/scrobble and logs a debug warning.

### 9) Short tracks and rapid skips
1. User rapidly skips tracks.
2. App throttles now playing updates and avoids spamming Last.fm.
3. Only eligible tracks are scrobbled.

## Proposed Architecture

### New module: `relisten/lastfm/`
- `LastFmClient.ts`
  - Low-level API calls (auth, now playing, scrobble).
  - Responsible for signing requests (API signature).
- `LastFmAuth.ts`
  - Token flow: `getToken`, open browser, `getSession`.
  - Handles redirect return (deep link).
- `LastFmScrobbleQueue.ts`
  - In-memory first; persists only on failure.
  - Flush on connectivity or app foreground.
- `LastFmService.ts`
  - Orchestrates playback events -> now playing/scrobble.
  - Knows whether the feature is enabled and authorized.

### Storage
- `LastFmSettings.ts`
  - App-level flags and metadata:
    - enabled (boolean)
    - username (string)
    - lastAuthAt (timestamp)
  - Stored in existing preferences storage (likely Realm or async storage).
- `LastFmSecrets.ts`
  - Session key stored in secure storage (Keychain/Keystore).
  - Optional: store API key in config (see security section).
- `LastFmScrobbleQueue.ts`
  - In-memory first; persisted only on failure.
  - Bounded by size and TTL to prevent unbounded growth.

### Playback integration
- Hook into `relisten/player/` to listen for:
  - track start -> `updateNowPlaying`
  - track completion -> `scrobble`
- Ensure scrobble has:
  - `artist`, `track`, `album`, `duration`, `timestamp` (start time).
  - Only scrobble if track played >= 50% or >= 4 minutes, per Last.fm rules.

## UI Changes

### Settings screen
- Add "Last.fm Scrobbling" section:
  - "Enable Last.fm Scrobbling" button (if not connected).
  - "Connected as <username>" + toggle ON/OFF.
  - "Disconnect" button.
  - Optional: link to "Manage in Last.fm" (opens website).
  - Auth error state: "Auth expired — reconnect to resume scrobbling" + "Reconnect" button.

### Status and errors
- Inline error if auth fails.
- Auth issues are surfaced in Settings (persistent) with a reconnect CTA.
- Transient network failures are handled silently via the queue; avoid noisy toasts.

## Data Flow

### Enable flow
1. User taps Enable.
2. `LastFmAuth.getToken` -> open auth URL.
3. On return, `LastFmAuth.getSession` -> store session key.
4. Store username and enable flag -> update UI.

### Now Playing flow
- On track start:
  - if enabled + sessionKey -> call `track.updateNowPlaying`.
  - If offline, skip (no queueing).

### Scrobble flow
- On track completion:
  - if enabled + sessionKey -> submit scrobble.
  - if offline or request fails -> enqueue (persisted).
  - flush queue on connectivity and app foreground.

### Seek/resume handling
- Keep the original track start timestamp for scrobble eligibility.
- Do not emit an extra now playing update on minor seeks; only if track changes.

## Deep Linking / Auth Return
- Use Expo Linking or native deep link:
  - `relisten://lastfm-auth` or `relisten://auth/lastfm`
- Store token before browser open, and finalize when app is resumed.
- On resume, call `auth.getSession` with the stored token.

## Secure Storage & Key Management

### API key/secret (app-level)
This is a FOSS repo, so secrets cannot be hard-coded.

Options:
1) **Use public API key for mobile app**
   - The API key is not truly secret; the secret is used for signature.
   - In practice, mobile apps embed the secret and accept exposure.
   - Risk: others can reuse the key/secret to sign requests as your app.
2) **Proxy through Relisten backend**
   - Store secret server-side, sign requests there.
   - Mobile app sends unsigned requests to backend.
   - More secure, but requires backend work, hosting, and maintenance.
3) **Per-install developer key**
   - Ask user to enter their own API key/secret.
   - Most secure for the project, but high friction.

Recommendation:
- Prefer **backend proxy** if Relisten already runs server infra.
- If not, accept **embedded key/secret** with transparency:
  - Document that API secret is visible in the app bundle.
  - Rotate keys if abused.

Environment variables:
- `EXPO_PUBLIC_LASTFM_API_KEY`
- `EXPO_PUBLIC_LASTFM_API_SECRET`
- Rationale: Expo public env vars are accessible at runtime in the app and fit the "accept exposure" stance.

### User session key (per-user)
- Store in secure storage:
  - iOS: Keychain
  - Android: Keystore
- Use `expo-secure-store` or existing secure storage module.
- Do not store in plaintext preferences.
- Clear on "Disconnect".

## Should We Use an npm Last.fm Client?

### Option A: Use a library
Pros:
- Faster initial implementation.
- Less chance of signature mistakes.
Cons:
- Many libraries are outdated or node-centric.
- Bundle size + dependency risk.
- Might not support React Native well (crypto, query signing).

### Option B: Roll our own minimal client
Pros:
- Small, explicit, and RN-friendly.
- Easy to audit for auth/signing.
- Avoids dependency drift.
Cons:
- Slightly more up-front work.
- Must maintain signing and request logic.

Recommendation:
- **Roll our own** for a minimal, RN-safe client.
- Implement only `auth.getToken`, `auth.getSession`, `track.updateNowPlaying`, `track.scrobble`.
- Keep it in `relisten/lastfm/LastFmClient.ts`.

## Classes and Changes Needed

### New files
- `relisten/lastfm/LastFmClient.ts`
- `relisten/lastfm/LastFmAuth.ts`
- `relisten/lastfm/LastFmService.ts`
- `relisten/lastfm/LastFmScrobbleQueue.ts`
- `relisten/lastfm/LastFmSettings.ts`
- `relisten/lastfm/LastFmSecrets.ts`

### Existing files to update
- Settings screen component:
  - Add UI section and handlers.
- Player event wiring:
  - Hook into track start/completion.
- App root / provider:
  - Initialize `LastFmService` and queue flush.
- Deep link handling:
  - Register `lastfm-auth` redirect and handle token exchange.

## Implementation Plan

### Phase 1: Configuration and scaffolding
- Add env var wiring and documentation:
  - Read `EXPO_PUBLIC_LASTFM_API_KEY` and `EXPO_PUBLIC_LASTFM_API_SECRET` in `LastFmClient.ts`.
  - Add docs in `README.md` or a new `docs/lastfm-setup.md` with setup instructions.
- Create `relisten/lastfm/` with stubbed classes:
  - `LastFmClient` to sign requests and make HTTP calls.
  - `LastFmSecrets` for session key storage (secure store).
  - `LastFmSettings` for enabled/username metadata.

### Phase 2: Auth flow
- Implement `LastFmAuth`:
  - `getToken` -> open Last.fm auth URL in browser.
  - Handle deep link return and call `getSession`.
  - Persist session key in secure storage and username in settings.
- Wire deep link handler in app root to finalize auth.

### Phase 3: Playback integration
- Add `LastFmService`:
  - Listen to playback events in `relisten/player/`.
  - On track start -> `updateNowPlaying`.
  - On track completion -> `scrobble` with timestamp and duration.
  - Apply Last.fm scrobble rules (>= 50% or >= 4 minutes).
- Add `LastFmScrobbleQueue`:
  - Attempt submission immediately; only persist on failure.
  - Store minimal queue entries (artist/track/album/duration/timestamp).
  - Enforce max queue size (e.g., 200) and TTL (e.g., 14 days).
  - Deduplicate by track+timestamp to avoid resubmission.
  - Flush on connectivity and app foreground.

### Phase 4: Settings UI
- Add a "Last.fm Scrobbling" section:
  - Enable button when not connected.
  - Toggle when connected.
  - Disconnect button to clear session key.
- Surface auth errors in-line.

### Phase 5: Reliability and analytics
- Debounce now playing updates for rapid skips.
- Add logging or lightweight telemetry for failures (if existing infra).
- Add a migration-safe path for storage updates.

## Reusing Relisten Playback History Infra

Questions to answer during implementation:
- Is there an existing playback history store/queue that already records track starts/completions?
- Does it capture start timestamps and durations needed for Last.fm scrobble rules?

Potential reuse:
- If Relisten already queues playback history while offline, reuse that queueing logic to feed `LastFmScrobbleQueue`.
- If history records "played percent" or progress checkpoints, reuse it to determine scrobble eligibility.
- If there is an existing foreground/background task system for playback history flush, reuse it for scrobble submission.

Does this match Last.fm guidance?
- Last.fm expects a scrobble with a **track start timestamp**, plus artist/track/album/duration.
- If Relisten’s playback history stores **start time** and **track duration**, it aligns well.
- If only end time is stored, compute start time from end time minus duration (still acceptable).
- Ensure "skip" or short playback does **not** scrobble (>= 50% or >= 4 minutes).

## Trade-offs and Risks
- Embedded API secret is visible in FOSS builds.
- Backend proxy adds infra cost and complexity.
- Last.fm rate limits (avoid spamming now playing on rapid skips).
- Offline scrobble queue must handle duplicates and ordering.

## Implementation Notes
- Throttle now playing updates:
  - Only update when track changes or after 30s.
- Scrobble rules:
  - Respect Last.fm rule of 50% or 4 minutes.
- Error handling:
  - Distinguish between auth errors and transient network errors.
- Metadata requirements:
  - Skip submission if artist or track name is missing.
  - Album is optional, but preferred.
- Account switching:
  - Clear persisted queue on disconnect to avoid cross-account scrobbles.

## Open Questions
- Do we have an existing backend that can proxy requests?
- Which secure storage module is already in the app?
- Preferred deep link scheme for auth callbacks?
