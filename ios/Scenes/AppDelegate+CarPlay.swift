//
//  AppDelegate+CarPlay.swift
//  Relisten
//
//  Created by Alec Gorge on 6/6/25.
//
import UIKit

extension AppDelegate {
  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    print("[carplay-debug] Class: \(type(of: self)), Method: \(#function) role=\(connectingSceneSession.role)")

    if (connectingSceneSession.role == UISceneSession.Role.carTemplateApplication) {
      let scene =  UISceneConfiguration(name: "CarPlay", sessionRole: connectingSceneSession.role)
      scene.delegateClass = CarSceneDelegate.self
      return scene
    } else {
      let scene =  UISceneConfiguration(name: "Phone", sessionRole: connectingSceneSession.role)
      scene.delegateClass = PhoneSceneDelegate.self
      return scene
    }
  }
}
