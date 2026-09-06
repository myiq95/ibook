import UIKit
import WebKit

class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1.0)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let userController = WKUserContentController()
        userController.add(self, name: "tts")
        userController.add(self, name: "ttsVoices")
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

        TTSManager.shared.onState = { [weak self] state in
            DispatchQueue.main.async {
                self?.webView.evaluateJavaScript("window.onNativeTTSState&&window.onNativeTTSState('\(state)')", completionHandler: nil)
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
        case "pause":
            TTSManager.shared.pause()
        case "resume":
            TTSManager.shared.resume()
        case "stop":
            TTSManager.shared.stop()
        default:
            break
        }
    }
}
