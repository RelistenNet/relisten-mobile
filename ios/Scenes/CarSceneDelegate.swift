//
//  CarSceneDelegate.swift
//  Relisten
//
//  Created by Alec Gorge on 6/6/25.
//
import Foundation
import CarPlay
import UIKit
import react_native_carplay

class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")


  }
  
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")


  }
  
  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                didConnect interfaceController: CPInterfaceController,
                                to window: CPWindow) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")

    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.ensureReactNativeStartedForCarPlay()
    }

    RNCarPlay.connect(with: interfaceController, window: window)
  }

  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                didDisconnect interfaceController: CPInterfaceController,
                                from window: CPWindow) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")

    RNCarPlay.disconnect()
  }

  // For non-navigation apps CarPlay calls the variants without the CPWindow parameter.
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")

    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.ensureReactNativeStartedForCarPlay()
    }

    RNCarPlay.connect(with: interfaceController, window: templateApplicationScene.carWindow)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController: CPInterfaceController
  ) {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function)")

    RNCarPlay.disconnect()
  }
}
