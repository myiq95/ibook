import UIKit
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let s = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: s); w.rootViewController = ViewController(); self.window = w; w.makeKeyAndVisible()
    }
}
