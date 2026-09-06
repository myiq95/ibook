
import AVFoundation
class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    private var paused = false
    var onState: ((String)->Void)?
    override init() {
        super.init()
        synth.delegate = self
        configureAudio()
    }
    private func configureAudio() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { print("Audio config failed") }
    }
    func speak(text: String, rate: Float, lang: String) {
        // User requested fixed 0.5 speed
        let fixedRate: Float = 0.5
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            print("[TTS] empty text, skip")
            onState?("finished")
            return
        }
        DispatchQueue.main.async {
            self.configureAudio()
            // Don't stop with delegate callback that triggers next
            if self.synth.isSpeaking {
                self.synth.stopSpeaking(at: .immediate)
            }
            let utterance = AVSpeechUtterance(string: clean)
            utterance.rate = fixedRate
            utterance.volume = 1.0
            utterance.pitchMultiplier = 1.0
            utterance.preUtteranceDelay = 0.0
            utterance.postUtteranceDelay = 0.1
            if let voice = AVSpeechSynthesisVoice(language: lang) {
                utterance.voice = voice
            } else if let voice = AVSpeechSynthesisVoice(language: "ko-KR") {
                utterance.voice = voice
            }
            print("[TTS V11] Speaking rate=0.5 text=\(clean.prefix(50)) voice=\(utterance.voice?.language ?? "nil")")
            self.paused = false
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
                print("[TTS] paused")
            }
        }
    }
    func resume() {
        DispatchQueue.main.async {
            if self.paused {
                self.synth.continueSpeaking()
                self.paused = false
                self.onState?("playing")
                print("[TTS] resumed")
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
            print("[TTS] stopped")
        }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        print("[TTS] didFinish")
        onState?("finished")
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        print("[TTS] didStart")
        onState?("playing")
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        print("[TTS] didCancel")
        // Don't send finished on cancel, otherwise it jumps to next
        onState?("stopped")
    }
    func getVoices() -> [[String:String]] {
        return AVSpeechSynthesisVoice.speechVoices().map { ["identifier": $0.identifier, "name": $0.name, "language": $0.language] }
    }
}
