import UIKit
import AVFoundation
class AppDelegate: UIResponder, UIApplicationDelegate {
    var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers, .allowAirPlay, .defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { print(error) }
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
    func applicationDidEnterBackground(_ application: UIApplication) {
        backgroundTask = application.beginBackgroundTask(withName: "TTSBackground") {
            application.endBackgroundTask(self.backgroundTask)
            self.backgroundTask = .invalid
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        // 백그라운드에서도 타이머 유지
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
            if self.backgroundTask != .invalid {
                application.endBackgroundTask(self.backgroundTask)
                self.backgroundTask = application.beginBackgroundTask(withName: "TTSBackground2") {}
            }
        }
    }
    func applicationWillEnterForeground(_ application: UIApplication) {
        if backgroundTask != .invalid { application.endBackgroundTask(backgroundTask); backgroundTask = .invalid }
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}
