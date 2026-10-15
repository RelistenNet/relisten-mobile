//
//  PhoneSceneDelegate.swift
//  Relisten
//
//  Created by Alec Gorge on 6/6/25.
//
import Foundation
import UIKit
import SwiftUI
import React
internal import Expo

class PhoneSceneDelegate: ExpoAppSceneDelegate {
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function) role=\(session.role)")

    if session.role != .windowApplication {
      return
    }

    guard
      let appDelegate = (UIApplication.shared.delegate as? AppDelegate),
      let windowScene = (scene as? UIWindowScene)
    else { return }

    // Scene connection options carry cold-start links. React Native reads these
    // from launch options before JS can receive a Linking event.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let activity = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }) {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    appDelegate.launchOptions = launchOptions.isEmpty ? nil : launchOptions

    let window: UIWindow

    if let bootstrapWindow = appDelegate.reactNativeBootstrapWindow {
      // RN was already started for CarPlay in a scene-less bootstrap window.
      // Move that window into this phone scene instead of transferring the root VC,
      // which avoids a didMoveToWindow(nil) gap that breaks Fabric surface rendering.
      bootstrapWindow.windowScene = windowScene
      bootstrapWindow.frame = windowScene.coordinateSpace.bounds
      bootstrapWindow.makeKeyAndVisible()
      bootstrapWindow.rootViewController?.view.setNeedsLayout()
      bootstrapWindow.rootViewController?.view.layoutIfNeeded()
      appDelegate.reactNativeBootstrapWindow = nil
      appDelegate.window = bootstrapWindow
      window = bootstrapWindow
    } else {
      window = UIWindow(windowScene: windowScene)
      appDelegate.attachReactNative(to: window)
    }

    self.window = window

    // Pin the phone UI to dark mode. We deliberately do NOT set
    // UIUserInterfaceStyle in Info.plist because that would also force the
    // CarPlay UIWindow into a dark trait collection, which causes
    // dynamic colors in CarPlay templates to resolve to their dark-mode
    // variants over CarPlay's vehicle-managed (often light) backgrounds.
    window.overrideUserInterfaceStyle = .dark

    // Keep our shared phone/CarPlay root, and use Expo's scene forwarding for
    // subscribers and React Native's scene-based Linking APIs.
    for userActivity in connectionOptions.userActivities {
      super.scene(scene, continue: userActivity)
    }

    super.scene(scene, openURLContexts: connectionOptions.urlContexts)
  }
}
