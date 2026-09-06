
import AVFoundation
class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    private var paused = false
    var onState: ((String)->Void)?
    override init() {
        super.init()
        synth.delegate = self
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AudioSession error")
        }
    }
    func speak(text: String, rate: Float, lang: String) {
        DispatchQueue.main.async {
            if self.synth.isSpeaking {
                self.synth.stopSpeaking(at: .immediate)
            }
            do { try AVAudioSession.sharedInstance().setActive(true) } catch {}
            let utterance = AVSpeechUtterance(string: text)
            utterance.rate = rate
            utterance.volume = 1.0
            utterance.voice = AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: "ko-KR")
            self.synth.speak(utterance)
            self.onState?("playing")
        }
    }
    func pause() {
        DispatchQueue.main.async {
            if self.synth.isSpeaking {
                self.synth.pauseSpeaking(at: .word)
                self.paused = true
                self.onState?("paused")
            }
        }
    }
    func resume() {
        DispatchQueue.main.async {
            if self.paused {
                self.synth.continueSpeaking()
                self.paused = false
                self.onState?("playing")
            }
        }
    }
    func stop() {
        DispatchQueue.main.async {
            if self.synth.isSpeaking || self.paused {
                self.synth.stopSpeaking(at: .immediate)
            }
            self.paused = false
            self.onState?("stopped")
        }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onState?("finished")
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        onState?("playing")
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onState?("stopped")
    }
    func getVoices() -> [[String:String]] {
        return AVSpeechSynthesisVoice.speechVoices().map { ["identifier": $0.identifier, "name": $0.name, "language": $0.language] }
    }
}
