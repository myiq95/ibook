
import UIKit; import WebKit; import MediaPlayer
class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!
    override func viewDidLoad(){
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1.0)
        let c=WKWebViewConfiguration(); c.allowsInlineMediaPlayback=true
        let ucc=WKUserContentController(); ucc.add(self,name:"tts"); ucc.add(self,name:"ttsVoices"); c.userContentController=ucc
        webView=WKWebView(frame:.zero, configuration:c)
        webView.translatesAutoresizingMaskIntoConstraints=false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        TTSManager.shared.onState={[weak self] s in DispatchQueue.main.async{ self?.webView.evaluateJavaScript("window.onNativeTTSState&&window.onNativeTTSState('\(s)')", completionHandler:nil) }}
        if let p=Bundle.main.path(forResource:"index",ofType:"html",inDirectory:"www"){ let u=URL(fileURLWithPath:p); webView.loadFileURL(u,allowingReadAccessTo:u.deletingLastPathComponent()) }
        let cc=MPRemoteCommandCenter.shared
        cc.playCommand.addTarget{ _ in TTSManager.shared.resume(); return .success }
        cc.pauseCommand.addTarget{ _ in TTSManager.shared.pause(); return .success }
        cc.stopCommand.addTarget{ _ in TTSManager.shared.stop(); return .success }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage){
        if message.name=="tts"{
            guard let b=message.body as? [String:Any] else {return}
            let a=b["action"] as? String ?? ""
            switch a{
            case "speak":
                let text=b["text"] as? String ?? ""
                let rate=(b["rate"] as? NSNumber)?.floatValue ?? 0.5
                let lang=b["lang"] as? String ?? "ko-KR"
                let voice=b["voice"] as? String
                TTSManager.shared.speak(text:text, rate:rate, lang:lang, voiceId:voice)
            case "pause": TTSManager.shared.pause()
            case "resume": TTSManager.shared.resume()
            case "stop": TTSManager.shared.stop()
            default: break
            }
        } else if message.name=="ttsVoices"{
            let vs=TTSManager.shared.getVoices()
            if let d=try? JSONSerialization.data(withJSONObject:vs), let j=String(data:d,encoding:.utf8){
                webView.evaluateJavaScript("window.onVoicesLoaded&&window.onVoicesLoaded(\(j))",completionHandler:nil)
            }
        }
    }
}
