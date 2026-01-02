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
      return
    }

    guard let factory = reactNativeFactory else { return }

    let bootstrapWindow = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(withModuleName: "main", in: bootstrapWindow, launchOptions: launchOptions)
    reactNativeRootViewController = bootstrapWindow.rootViewController
    reactNativeBootstrapWindow = bootstrapWindow
    window = bootstrapWindow
  }

  public func attachReactNative(to window: UIWindow) {
    configureReactNativeFactoryIfNeeded()

    if let existingRoot = reactNativeRootViewController {
      window.rootViewController = existingRoot
      window.makeKeyAndVisible()

      if let bootstrapWindow = reactNativeBootstrapWindow, bootstrapWindow !== window {
        bootstrapWindow.isHidden = true
        bootstrapWindow.rootViewController = nil
        reactNativeBootstrapWindow = nil
      }
    } else if let factory = reactNativeFactory {
      factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
      reactNativeRootViewController = window.rootViewController
    }

    self.window = window
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
