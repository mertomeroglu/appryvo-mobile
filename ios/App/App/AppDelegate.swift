import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    // Unused under the UIScene lifecycle (the window belongs to SceneDelegate). Kept because some
    // plugins (e.g. AdMob getRootVC) probe `UIApplication.shared.delegate?.window` before falling
    // back to the connected scene's key window.
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    // MARK: UIScene lifecycle (required when building with the iOS 27 SDK)

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        // Must match UIApplicationSceneManifest in Info.plist. The storyboard is set explicitly so
        // the window/root view controller never depends on Info.plist name matching alone.
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        config.storyboard = UIStoryboard(name: "Main", bundle: nil)
        return config
    }

    // URL scheme and Universal Link handling lives in SceneDelegate: under the scene lifecycle
    // UIKit delivers them to the scene, not to application(_:open:) / application(_:continue:).

    // MARK: Push notifications (application-level, unchanged by the scene lifecycle)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
