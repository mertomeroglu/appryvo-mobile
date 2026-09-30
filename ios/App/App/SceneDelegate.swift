import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    // Created by UIKit from the scene configuration's storyboard (Main.storyboard, whose initial
    // view controller is CAPBridgeViewController). There is exactly one window: the one UIKit
    // assigns here before scene(_:willConnectTo:options:) is called.
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }

        // Cold start: URL scheme / Universal Link payloads arrive in connectionOptions, not in
        // scene(_:openURLContexts:). Capacitor replays them once the bridge has loaded its plugins
        // (first capacitorViewDidAppear), so App's appUrlOpen still reaches JS.
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Warm state: custom URL scheme (appryvo://).
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // Warm state: Universal Links (applinks:appryvo.online).
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

}
