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
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function) role=\(session.role)")

    if session.role != .windowApplication {
      return
    }
    
    guard
      let appDelegate = (UIApplication.shared.delegate as? AppDelegate),
      let windowScene = (scene as? UIWindowScene)
    else { return }

    let window = UIWindow(windowScene: windowScene)
    
    appDelegate.attachReactNative(to: window)

    self.window = window

    // Forward universal links received on cold start
    for userActivity in connectionOptions.userActivities {
      RCTLinkingManager.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in }
      )
    }

    // Forward custom URL scheme links received on cold start
    for urlContext in connectionOptions.urlContexts {
      RCTLinkingManager.application(
        UIApplication.shared,
        open: urlContext.url,
        options: [:]
      )
    }
  }
  
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")

    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { restoring in })
  }
}
