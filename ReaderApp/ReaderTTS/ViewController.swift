import UIKit
import WebKit
import AVFoundation

class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!
    var isReturningFromLock = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1.0)
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let userController = WKUserContentController()
        userController.add(self, name: "tts")
        config.userContentController = userController
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // 백그라운드 -> 포그라운드: 멈추지 말고 오디오 세션만 살리기 (중복 방지 stop 제거!)
        NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
            try? AVAudioSession.sharedInstance().setActive(true)
            // 웹 쪽 가짜 speechSynthesis만 취소, 네이티브는 그대로 둠
            self.webView.evaluateJavaScript("if(window.speechSynthesis && window.speechSynthesis._queue){ window.speechSynthesis.cancel(); }", completionHandler: nil)
            // 네이티브가 paused 상태면 resume
            if self.isReturningFromLock {
                self.isReturningFromLock = false
                // 0.3초 뒤에 resume (오디오 세션 활성화 후)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    TTSManager.shared.resumeIfPaused()
                }
            }
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
            self.isReturningFromLock = true
            try? AVAudioSession.sharedInstance().setActive(true)
        }

        TTSManager.shared.onState = { [weak self] state in
            DispatchQueue.main.async {
                self?.webView.evaluateJavaScript("window.onNativeTTSState&&window.onNativeTTSState('\(state)')", completionHandler: nil)
            }
        }
        TTSManager.shared.onIndex = { [weak self] idx in
            DispatchQueue.main.async {
                self?.webView.evaluateJavaScript("window.onNativeTTSIndex&&window.onNativeTTSIndex(\(idx))", completionHandler: nil)
            }
        }
        if let path = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "www") {
            let url = URL(fileURLWithPath: path)
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let action = body["action"] as? String ?? ""
        switch action {
        case "speak":
            let text = body["text"] as? String ?? ""
            TTSManager.shared.speak(text: text, rate: 0.5, lang: "ko-KR")
        case "speakQueue":
            if let texts = body["texts"] as? [String], let idx = body["startIndex"] as? Int {
                TTSManager.shared.speakQueue(texts: texts, startIndex: idx)
            }
        case "pause": TTSManager.shared.pause()
        case "resume": TTSManager.shared.resume()
        case "stop": TTSManager.shared.stop()
        default: break
        }
    }
}
