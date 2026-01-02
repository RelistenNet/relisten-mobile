import Expo
import UIKit
// @generated begin react-native-google-cast-import - expo prebuild (DO NOT MODIFY) sync-4cd300bca26a1d1fcc83f4baf37b0e62afcc1867
#if canImport(GoogleCast) && os(iOS)
import GoogleCast
#endif
// @generated end react-native-google-cast-import
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  var reactNativeRootViewController: UIViewController?
  var reactNativeBootstrapWindow: UIWindow?
  
  // Some parts of expo/react native seem to expect this property to be here
  public var window: UIWindow? = nil

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")
    
// @generated begin react-native-google-cast-didFinishLaunchingWithOptions - expo prebuild (DO NOT MODIFY) sync-b83f3fabf49797475a3f26a5bfeb5cfd51fa39c4
#if canImport(GoogleCast) && os(iOS)
    let receiverAppID = kGCKDefaultMediaReceiverApplicationID
    let criteria = GCKDiscoveryCriteria(applicationID: receiverAppID)
    let options = GCKCastOptions(discoveryCriteria: criteria)
    options.disableDiscoveryAutostart = false
    options.startDiscoveryAfterFirstTapOnCastButton = true
    options.suspendSessionsWhenBackgrounded = true
    GCKCastContext.setSharedInstanceWith(options)
    GCKCastContext.sharedInstance().useDefaultExpandedMediaControls = true
#endif
// @generated end react-native-google-cast-didFinishLaunchingWithOptions
    self.launchOptions = launchOptions
    configureReactNativeFactoryIfNeeded()

    // window moved to PhoneSceneDelegate
//    window = UIWindow(frame: UIScreen.main.bounds)
//    factory.startReactNative(
//      withModuleName: "main",
//      in: window,
//      launchOptions: launchOptions)
    
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func configureReactNativeFactoryIfNeeded() {
    if reactNativeFactory != nil {
      return
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
  }

  public func ensureReactNativeStartedForCarPlay() {
    configureReactNativeFactoryIfNeeded()

    if reactNativeRootViewController != nil {
      // CarPlay reconnects can happen quickly; keep the existing bridge and unhide any bootstrap window.
      if let bootstrapWindow = reactNativeBootstrapWindow, bootstrapWindow.isHidden {
        bootstrapWindow.isHidden = false
      }
      return
    }

    guard let factory = reactNativeFactory else { return }

    // If a phone UIWindowScene exists, prefer it; otherwise fall back to a scene-less window for CarPlay-only launches.
    let bootstrapWindow: UIWindow
    if let windowScene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.session.role == .windowApplication && $0.activationState == .foregroundActive }) ??
      UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.session.role == .windowApplication }) {
      bootstrapWindow = UIWindow(windowScene: windowScene)
    } else {
      bootstrapWindow = UIWindow(frame: UIScreen.main.bounds)
    }
    factory.startReactNative(withModuleName: "main", in: bootstrapWindow, launchOptions: launchOptions)
    reactNativeRootViewController = bootstrapWindow.rootViewController
    reactNativeBootstrapWindow = bootstrapWindow
    window = bootstrapWindow
  }

  public func attachReactNative(to window: UIWindow) {
    configureReactNativeFactoryIfNeeded()

    if let existingRoot = reactNativeRootViewController {
      // Reattach the existing bridge to the phone window so we don't create a second RN instance.
      window.rootViewController = existingRoot
      window.makeKeyAndVisible()

      if let bootstrapWindow = reactNativeBootstrapWindow, bootstrapWindow !== window {
        // Clear the bootstrap window to avoid competing key windows and duplicate view hierarchies.
        bootstrapWindow.isHidden = true
        bootstrapWindow.rootViewController = nil
        reactNativeBootstrapWindow = nil
      }
    } else if let factory = reactNativeFactory {
      factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
      reactNativeRootViewController = window.rootViewController
    }

    // Edge case: if multiple phone scenes exist, we keep the most recent attach as the active window.
    self.window = window
  }

  public func handleCarPlayDisconnect() {
    guard let bootstrapWindow = reactNativeBootstrapWindow else { return }

    // Hide the bootstrap window on CarPlay disconnect to reduce key-window conflicts until the phone UI attaches.
    if window === bootstrapWindow {
      bootstrapWindow.isHidden = true
    }

    // Edge case: if no phone scene ever attaches, the RN bridge stays alive without a visible window.
    // This is intentional to keep reconnects fast, but it can complicate debugging if the app seems "running".
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
