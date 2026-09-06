
import AVFoundation
class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    var onState: ((String)->Void)?
    override init(){
        super.init()
        synth.delegate=self
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }
    func speak(text: String, rate: Float, lang: String){
        let txt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else { onState?("finished"); return }
        DispatchQueue.main.async {
            // V13: 버벅임 방지 - stop 후 바로 speak, 딜레이 0
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            try? AVAudioSession.sharedInstance().setActive(true)
            let u = AVSpeechUtterance(string: txt)
            u.rate = 0.5 // 사용자 요청 고정
            u.volume = 1.0
            u.preUtteranceDelay = 0
            u.postUtteranceDelay = 0
            u.voice = AVSpeechSynthesisVoice(language: "ko-KR")
            print("[TTS V13] speak 0.5: \(txt.prefix(30))")
            self.synth.speak(u)
            self.onState?("playing")
        }
    }
    func pause(){ DispatchQueue.main.async{ self.synth.pauseSpeaking(at: .word); self.onState?("paused") } }
    func resume(){ DispatchQueue.main.async{ self.synth.continueSpeaking(); self.onState?("playing") } }
    func stop(){ DispatchQueue.main.async{ self.synth.stopSpeaking(at: .immediate); self.onState?("stopped") } }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance){ onState?("finished") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance){ onState?("playing") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance){ onState?("stopped") }
    func getVoices() -> [[String:String]] { AVSpeechSynthesisVoice.speechVoices().map{ ["identifier": $0.identifier, "name": $0.name, "language": $0.language] } }
}
