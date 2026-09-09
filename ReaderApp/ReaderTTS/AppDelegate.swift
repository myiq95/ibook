import UIKit
import AVFoundation

class AppDelegate: UIResponder, UIApplicationDelegate {
    var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers, .allowAirPlay, .duckOthers])
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("AudioSession init error: \(error)")
        }
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // 화면 꺼져도 백그라운드 유지
        backgroundTask = application.beginBackgroundTask(withName: "TTSBackground") {
            application.endBackgroundTask(self.backgroundTask)
            self.backgroundTask = .invalid
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        print("Entered background, task: \(backgroundTask.rawValue)")
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        if backgroundTask != .invalid {
            application.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}
