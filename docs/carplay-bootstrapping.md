# CarPlay bootstrapping: JS bridge + realm timing

This doc outlines how to implement two fixes for the blank CarPlay screen issue:

1) Ensure React Native JS boots even when CarPlay launches the app without the phone UI.
2) Make CarPlay setup resilient to realm initialization timing.

## Background

Current behavior:
- The React Native bridge starts only in the phone scene (`PhoneSceneDelegate`).
- `CarPlay.registerOnConnect` is registered in `app/relisten/_layout.tsx` after the JS tree mounts.
- `setupCarPlay` is skipped when `realm` is not ready, with no retry.

This means a CarPlay-only launch can connect before JS/realm are ready, leaving CarPlay without a root template.

## (1) Boot React Native for CarPlay-only launches

Goal: When CarPlay connects, start the RN bridge (if not already running) so CarPlay templates can be created.

### Recommendation: Option A (start RN on CarPlay connect)

Why this is preferred for Relisten:
- Starts RN only when CarPlay actually connects (lower overhead).
- Works with the library’s `checkForConnection` replay: once JS is up, the native module can re-emit `didConnect`.
- Matches current architecture where RN boot normally happens from a scene delegate.

### Option A: Start RN bridge from `CarSceneDelegate`

Required ordering:
1) Start RN bridge (if needed).
2) Call `RNCarPlay.connect(...)`.
3) JS side receives (or replays) `didConnect` and calls `setupCarPlay`.

Implementation sketch (specific flow):
- Add a helper to `AppDelegate` to lazily start RN if needed.
- Call it at the start of `CarSceneDelegate.templateApplicationScene(_:didConnect:to:)`.
- Keep the existing `RNCarPlay.connect(...)` call right after.

Important: `ExpoReactNativeFactory.startReactNative(...)` always calls `makeKeyAndVisible` on the window (see `RCTReactNativeFactory.startReactNativeWithModuleName`). That means a “hidden” bootstrap window will become key until you explicitly move the root view to the phone window.

Example (conceptual Swift; adapt to project style):

```swift
// AppDelegate.swift
public var reactNativeRootViewController: UIViewController?
public var reactNativeBootstrapWindow: UIWindow?

public func ensureReactNativeStarted() {
  if reactNativeFactory == nil {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()
    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
  }

  guard let factory = reactNativeFactory else { return }

  if reactNativeRootViewController == nil {
    let bootstrapWindow = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(withModuleName: "main", in: bootstrapWindow, launchOptions: launchOptions)
    reactNativeRootViewController = bootstrapWindow.rootViewController
    reactNativeBootstrapWindow = bootstrapWindow
    window = bootstrapWindow
  }
}

// CarSceneDelegate.swift
func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                              didConnect interfaceController: CPInterfaceController,
                              to window: CPWindow) {
  if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
    appDelegate.ensureReactNativeStarted()
  }

  RNCarPlay.connect(with: interfaceController, window: window)
}
```

Notes:
- This uses the same RN entrypoint (`main`).
- The bootstrap window will become key/visible because `startReactNative` calls `makeKeyAndVisible`.
- When the phone scene later connects, move the existing root view controller to the phone window and hide the bootstrap window to avoid two key windows and duplicate bridges.

Phone scene attachment (conceptual):

```swift
// PhoneSceneDelegate.swift
func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
  guard
    let appDelegate = (UIApplication.shared.delegate as? AppDelegate),
    let windowScene = (scene as? UIWindowScene),
    let factory = appDelegate.reactNativeFactory
  else { return }

  let window = UIWindow(windowScene: windowScene)

  if let existingRoot = appDelegate.reactNativeRootViewController {
    window.rootViewController = existingRoot
    window.makeKeyAndVisible()
    appDelegate.reactNativeBootstrapWindow?.isHidden = true
    appDelegate.reactNativeBootstrapWindow?.rootViewController = nil
    appDelegate.reactNativeBootstrapWindow = nil
  } else {
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: appDelegate.launchOptions)
    appDelegate.reactNativeRootViewController = window.rootViewController
  }

  appDelegate.window = window
  self.window = window
}
```

### Option B: Start RN from `application(_:configurationForConnecting:)`

This starts RN when the system asks for a scene configuration, before CarPlay connects.

Pros:
- Reduces race risk between CarPlay connect and RN boot.

Cons:
- May start RN even if CarPlay never actually connects.
- Can start RN while app is backgrounded, which may have lifecycle/perf implications.
- Harder to reason about in multi-scene setups, because it runs before you know which scene will complete.

When to choose Option B:
- Only if Option A still races in practice (rare with `checkForConnection`).

## (2) Make CarPlay setup resilient to realm timing

Goal: If CarPlay connects before realm is ready, still set up templates when realm becomes available.

### Approach

- Keep a pending "CarPlay needs setup" flag or queue when `didConnect` fires.
- When `realm` becomes available, call `setupCarPlay` once.
- Ensure this only runs once per CarPlay session to avoid duplicate templates.

Recommended structure:
- Move the React lifecycle and retry logic into a dedicated hook: `relisten/carplay/useCarPlaySetup.ts`.
- The hook should accept the `apiClient` and access `realm` from context or a prop.
- `app/relisten/_layout.tsx` should only call the hook and keep layout concerns.

### Implementation sketch (TypeScript)

Where: `app/relisten/_layout.tsx`

```ts
// relisten/carplay/useCarPlaySetup.ts
export function useCarPlaySetup(apiClient: RelistenApiClient, realm?: Realm) {
  // logic from below lives here
}

// app/relisten/_layout.tsx
useCarPlaySetup(apiClient, realm);

const isCarPlayConnected = useRef(false);
const hasSetupCarPlay = useRef(false);
const teardownRef = useRef<(() => void) | null>(null);

const trySetupCarPlay = () => {
  if (hasSetupCarPlay.current) return;
  if (!realm || !isCarPlayConnected.current) return;
  teardownRef.current = setupCarPlay(realm, apiClient);
  hasSetupCarPlay.current = true;
};

useEffect(() => {
  const connect = onConnect(apiClient, () => {
    isCarPlayConnected.current = true;
    trySetupCarPlay();
  });

  const disconnect = () => {
    isCarPlayConnected.current = false;
    hasSetupCarPlay.current = false;
    teardownRef.current?.();
    teardownRef.current = null;
  };

  CarPlay.registerOnConnect(connect);
  CarPlay.registerOnDisconnect(disconnect);
  return () => {
    CarPlay.unregisterOnConnect(connect);
    CarPlay.unregisterOnDisconnect(disconnect);
    disconnect();
  };
}, [apiClient, realm]);

useEffect(() => {
  // Retry when realm becomes available or changes
  trySetupCarPlay();
}, [realm, apiClient]);
```

Notes:
- `realm` should come from a hook or context that updates when `setRealm` runs.
- Ensure `setupCarPlay` only runs once per connection; reset on disconnect.

## User journeys and expected behavior

1) CarPlay connects while app is cold (phone UI not running)
- Native CarPlay connects and calls `ensureReactNativeStarted`.
- RN starts in a bootstrap window, then `RNCarPlay.connect` fires.
- JS registers `registerOnConnect` and the native module replays `didConnect` via `checkForConnection`.
- `setupCarPlay` runs once realm is ready.

2) Phone UI running, then CarPlay connects
- RN already running; `ensureReactNativeStarted` no-ops.
- `RNCarPlay.connect` fires immediately; JS receives `didConnect` normally.

3) CarPlay connects, then phone UI opens later
- RN started in bootstrap window.
- On phone scene connect, reuse existing root view controller and move it to the phone window.
- Hide and detach the bootstrap window.

4) CarPlay disconnects and reconnects
- Disconnect should trigger teardown (`setupCarPlay` cleanup + flags reset).
- Reconnect should rebuild templates without creating a second bridge.

5) Phone app killed, then CarPlay connects again
- Same as (1). Ensure `ensureReactNativeStarted` handles cold start.

## Edge cases and guardrails

- Avoid calling `startReactNative` more than once; it creates a new root view and calls `makeKeyAndVisible`.
- Keep a single source of truth for the active root view controller.
- Always clear the bootstrap window after the phone scene takes over to avoid two key windows.
- If `setupCarPlay` depends on realm, make it retry-safe and idempotent for a single connection.
## Validation plan

- Launch CarPlay when the app is not running. Confirm RN boots and CarPlay UI shows root tab bar.
- Background/terminate app, reconnect CarPlay, and verify UI shows consistently.
- Simulate slow realm init (e.g., add a delay) and confirm UI eventually appears.

## Logging and troubleshooting

Add temporary logs around:
- `CarSceneDelegate` connect/disconnect
- RN bootstrapping path
- `CarPlay.registerOnConnect` firing
- `realm` availability + `setupCarPlay` call

Remove verbose logs after validating.
