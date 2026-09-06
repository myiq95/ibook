
import AVFoundation
class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    private var paused=false
    var onState: ((String)->Void)?
    override init(){ super.init(); synth.delegate=self; do{ try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers]); try AVAudioSession.sharedInstance().setActive(true)}catch{print(error)} }
    func speak(text:String, rate:Float=0.5, lang:String="ko-KR", voiceId:String?=nil){
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at:.immediate) }
            do{ try AVAudioSession.sharedInstance().setActive(true) }catch{}
            let u=AVSpeechUtterance(string:text); u.rate=min(max(rate,0.0),1.0); u.volume=1.0
            if let id=voiceId, let v=AVSpeechSynthesisVoice(identifier:id){ u.voice=v } else { u.voice=AVSpeechSynthesisVoice(language:lang) ?? AVSpeechSynthesisVoice(language:"ko-KR") }
            print("[TTS] speak \(text.prefix(40)) lang=\(u.voice?.language ?? "") rate=\(u.rate)")
            self.synth.speak(u); self.onState?("playing")
        }
    }
    func pause(){ DispatchQueue.main.async{ if self.synth.isSpeaking{ self.synth.pauseSpeaking(at:.word); self.paused=true; self.onState?("paused") } } }
    func resume(){ DispatchQueue.main.async{ if self.paused{ self.synth.continueSpeaking(); self.paused=false; self.onState?("playing") } } }
    func stop(){ DispatchQueue.main.async{ if self.synth.isSpeaking || self.paused{ self.synth.stopSpeaking(at:.immediate) }; self.paused=false; self.onState?("stopped") } }
    func speechSynthesizer(_ s:AVSpeechSynthesizer, didFinish utterance:AVSpeechUtterance){ onState?("finished") }
    func speechSynthesizer(_ s:AVSpeechSynthesizer, didStart utterance:AVSpeechUtterance){ onState?("playing") }
    func speechSynthesizer(_ s:AVSpeechSynthesizer, didCancel utterance:AVSpeechUtterance){ onState?("stopped") }
    func getVoices()->[[String:String]]{ AVSpeechSynthesisVoice.speechVoices().map{ ["identifier":$0.identifier,"name":$0.name,"language":$0.language] } }
}
