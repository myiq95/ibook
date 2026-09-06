import AVFoundation

class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    var onState: ((String) -> Void)?
    private var audioConfigured = false

    override init() {
        super.init()
        synth.delegate = self
        configureAudioOnce()
    }

    private func configureAudioOnce() {
        guard !audioConfigured else { return }
        audioConfigured = true
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers, .allowAirPlay])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Audio config failed")
        }
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
            // V15: 매번 setActive 호출 제거 - 발열 원인
            let utterance = AVSpeechUtterance(string: txt)
            utterance.rate = 0.5
            utterance.volume = 1.0
            utterance.preUtteranceDelay = 0
            utterance.postUtteranceDelay = 0.15 // V15: 0.15초 휴지로 CPU 쿨다운
            utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
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
        // V15: 다음 문장 전 0.15초는 utterance.postUtteranceDelay가 처리
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
