//
//  CarSceneDelegate.swift
//  Relisten
//
//  Created by Alec Gorge on 6/6/25.
//
import Foundation
import CarPlay
import react_native_carplay

class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
    RNCarPlay.connect(with: interfaceController, window: templateApplicationScene.carWindow);
  }

  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
    RNCarPlay.disconnect()
  }
  
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    
  }
  
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    
  }
}
