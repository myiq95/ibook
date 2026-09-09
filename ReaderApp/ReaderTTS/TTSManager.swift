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

    private func pickBestKoreanVoice() -> AVSpeechSynthesisVoice? {
        let allVoices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ko") }
        // 1. 이름에 지안이 들어간 보이스 (프리미엄)
        if let jian = allVoices.first(where: { $0.name.contains("지안") || $0.name.lowercased().contains("jian") }) {
            return jian
        }
        // 2. Enhanced quality (프리미엄)
        if let enhanced = allVoices.first(where: { $0.quality == .enhanced }) {
            return enhanced
        }
        // 3. 시스템 기본값 - nil을 리턴하면 iOS가 설정 > 손쉬운 사용 > 음성 콘텐츠에서 설정한 기본 보이스(지안 프리미엄)를 사용
        return nil
    }

    func speak(text: String, rate: Float, lang: String) {
        let txt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else { onState?("finished"); return }
        DispatchQueue.main.async {
            // 이미 말하고 있으면 바로 멈추지 말고 약간 대기 후
            if self.synth.isSpeaking {
                self.synth.stopSpeaking(at: .immediate)
            }
            self.configureAudioOnce()
            let utterance = AVSpeechUtterance(string: txt)
            utterance.rate = 0.5
            utterance.volume = 1.0
            utterance.preUtteranceDelay = 0
            utterance.postUtteranceDelay = 0.15
            
            // 중요: 아이폰 설정에 있는 목소리 그대로 사용
            if let bestVoice = self.pickBestKoreanVoice() {
                utterance.voice = bestVoice
                print("Using voice: \(bestVoice.name) quality: \(bestVoice.quality.rawValue)")
            } else {
                // nil이면 시스템 기본값 (사용자가 설정한 지안 프리미엄)
                utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
                // 만약 그것도 안되면 아예 지정 안함 - 시스템이 알아서 지안으로
                if utterance.voice == nil {
                    print("Using system default voice (should be Jian Premium)")
                }
            }
            
            self.synth.speak(utterance)
            self.onState?("playing")
        }
    }

    func pause() { DispatchQueue.main.async { self.synth.pauseSpeaking(at: .word); self.onState?("paused") } }
    func resume() { 
        DispatchQueue.main.async { 
            self.configureAudioOnce()
            self.synth.continueSpeaking(); 
            self.onState?("playing") 
        } 
    }
    func stop() { DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate); self.onState?("stopped") } }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { onState?("finished") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) { onState?("playing") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { onState?("stopped") }
    func getVoices() -> [[String: String]] { 
        AVSpeechSynthesisVoice.speechVoices().map { 
            ["identifier": $0.identifier, "name": $0.name, "language": $0.language, "quality": "\($0.quality.rawValue)"] 
        } 
    }
}
