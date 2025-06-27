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

class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    if session.role != .windowApplication {
      return
    }
    
    guard
      let appDelegate = (UIApplication.shared.delegate as? AppDelegate),
      let windowScene = (scene as? UIWindowScene),
      let reactNativeFactory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    
    // This calls makeKeyAndVisible
    reactNativeFactory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    
    self.window = window
    appDelegate.window = window
  }
  
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { restoring in })
  }
}
