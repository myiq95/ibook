
import UIKit; import WebKit
class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!
    override func viewDidLoad(){
        super.viewDidLoad()
        view.backgroundColor=UIColor(red:0.96,green:0.94,blue:0.90,alpha:1)
        let c=WKWebViewConfiguration(); c.allowsInlineMediaPlayback=true
        let uc=WKUserContentController(); uc.add(self,name:"tts"); uc.add(self,name:"ttsVoices"); c.userContentController=uc
        webView=WKWebView(frame:.zero,configuration:c)
        webView.translatesAutoresizingMaskIntoConstraints=false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo:view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo:view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo:view.bottomAnchor)
        ])
        TTSManager.shared.onState={[weak self] s in DispatchQueue.main.async{ self?.webView.evaluateJavaScript("window.onNativeTTSState&&window.onNativeTTSState('\(s)')", completionHandler:nil) }}
        if let p=Bundle.main.path(forResource:"index",ofType:"html",inDirectory:"www"){ let u=URL(fileURLWithPath:p); webView.loadFileURL(u,allowingReadAccessTo:u.deletingLastPathComponent()) }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage){
        guard let b=message.body as? [String:Any] else {return}
        let a=b["action"] as? String ?? ""
        switch a{
        case "speak": let t=b["text"] as? String ?? ""; TTSManager.shared.speak(text:t, rate:0.5, lang:"ko-KR")
        case "pause": TTSManager.shared.pause()
        case "resume": TTSManager.shared.resume()
        case "stop": TTSManager.shared.stop()
        default: break
        }
    }
}
