import AVFoundation

class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    var onState: ((String) -> Void)?

    override init() {
        super.init()
        synth.delegate = self
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func speak(text: String, rate: Float, lang: String) {
        let txt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else {
            onState?("finished")
            return
        }
        DispatchQueue.main.async {
            if self.synth.isSpeaking {
                self.synth.stopSpeaking(at: .immediate)
            }
            try? AVAudioSession.sharedInstance().setActive(true)
            let utterance = AVSpeechUtterance(string: txt)
            utterance.rate = 0.5
            utterance.volume = 1.0
            utterance.preUtteranceDelay = 0
            utterance.postUtteranceDelay = 0
            utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
            print("[TTS V14] speak 0.5: \(txt.prefix(30))")
            self.synth.speak(utterance)
            self.onState?("playing")
        }
    }

    func pause() {
        DispatchQueue.main.async {
            self.synth.pauseSpeaking(at: .word)
            self.onState?("paused")
        }
    }

    func resume() {
        DispatchQueue.main.async {
            self.synth.continueSpeaking()
            self.onState?("playing")
        }
    }

    func stop() {
        DispatchQueue.main.async {
            self.synth.stopSpeaking(at: .immediate)
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

    func getVoices() -> [[String: String]] {
        return AVSpeechSynthesisVoice.speechVoices().map { voice in
            return ["identifier": voice.identifier, "name": voice.name, "language": voice.language]
        }
    }
}
