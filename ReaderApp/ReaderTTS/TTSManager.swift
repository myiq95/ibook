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
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers, .allowAirPlay, .duckOthers])
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("AudioSession error: \(error)")
        }
    }

    private func keepAudioAlive() {
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func pickBestKoreanVoice() -> AVSpeechSynthesisVoice? {
        let allVoices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ko") }
        if let jian = allVoices.first(where: { $0.name.contains("지안") || $0.name.lowercased().contains("jian") }) {
            return jian
        }
        if let enhanced = allVoices.first(where: { $0.quality == .enhanced }) {
            return enhanced
        }
        return nil
    }

    func speak(text: String, rate: Float, lang: String) {
        let txt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else { onState?("finished"); return }
        DispatchQueue.main.async {
            if self.synth.isSpeaking {
                self.synth.stopSpeaking(at: .immediate)
            }
            self.keepAudioAlive()
            let utterance = AVSpeechUtterance(string: txt)
            utterance.rate = 0.5
            utterance.volume = 1.0
            utterance.preUtteranceDelay = 0
            utterance.postUtteranceDelay = 0.01 // 화면 꺼짐 방지: 무음 최소화
            if let bestVoice = self.pickBestKoreanVoice() {
                utterance.voice = bestVoice
                print("Using voice: \(bestVoice.name)")
            } else {
                utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
            }
            self.synth.speak(utterance)
            self.onState?("playing")
        }
    }

    func pause() { DispatchQueue.main.async { self.synth.pauseSpeaking(at: .word); self.onState?("paused") } }
    func resume() { DispatchQueue.main.async { self.keepAudioAlive(); self.synth.continueSpeaking(); self.onState?("playing") } }
    func stop() { DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate); self.onState?("stopped") } }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { keepAudioAlive(); onState?("finished") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) { keepAudioAlive(); onState?("playing") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { onState?("stopped") }
    func getVoices() -> [[String: String]] {
        AVSpeechSynthesisVoice.speechVoices().map { ["identifier": $0.identifier, "name": $0.name, "language": $0.language, "quality": "\($0.quality.rawValue)"] }
    }
}
