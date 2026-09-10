import AVFoundation

class TTSManager: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = TTSManager()
    private let synth = AVSpeechSynthesizer()
    var onState: ((String) -> Void)?
    var onIndex: ((Int) -> Void)?
    var onWord: ((Int, Int, Int) -> Void)? // (sentenceIdx, charStart, charLength)
    private var queue: [String] = []
    private var currentIdx: Int = 0
    private var isQueueMode: Bool = false
    private var keepAliveTimer: Timer?

    override init() {
        super.init()
        synth.delegate = self
        configureAudio()
        NotificationCenter.default.addObserver(self, selector: #selector(handleInterruption), name: AVAudioSession.interruptionNotification, object: nil)
        startKeepAliveTimer()
    }

    private func startKeepAliveTimer(){
        keepAliveTimer?.invalidate()
        keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if self.synth.isSpeaking {
                try? AVAudioSession.sharedInstance().setActive(true)
            }
        }
    }

    private func configureAudio() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers, .allowAirPlay, .defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
        } catch { print("AudioSession error: \(error)") }
    }

    private func keepAlive() { try? AVAudioSession.sharedInstance().setActive(true) }

    private func bestVoice() -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ko") }
        if let jian = voices.first(where: { $0.name.contains("지안") || $0.name.lowercased().contains("jian") }) { return jian }
        if let enh = voices.first(where: { $0.quality == .enhanced }) { return enh }
        return nil
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
        if type == .ended {
            keepAlive()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.resume() }
        }
    }

    func speak(text: String, rate: Float, lang: String) {
        isQueueMode = false
        queue = []
        speakSingle(text: text)
    }

    private func speakSingle(text: String) {
        let txt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !txt.isEmpty else { onState?("finished"); return }
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.keepAlive()
            let u = AVSpeechUtterance(string: txt)
            u.rate = 0.5; u.volume = 1.0; u.preUtteranceDelay = 0; u.postUtteranceDelay = 0.01
            if let v = self.bestVoice() { u.voice = v } else { u.voice = AVSpeechSynthesisVoice(language: "ko-KR") }
            self.synth.speak(u)
            self.onState?("playing")
        }
    }

    func speakQueue(texts: [String], startIndex: Int) {
        DispatchQueue.main.async {
            self.synth.stopSpeaking(at: .immediate)
            self.queue = texts
            self.currentIdx = startIndex
            self.isQueueMode = true
            self.keepAlive()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.speakQueueNext()
            }
        }
    }

    private func speakQueueNext() {
        guard isQueueMode else { return }
        guard currentIdx < queue.count else {
            onState?("finished")
            isQueueMode = false
            return
        }
        let txt = queue[currentIdx].trimmingCharacters(in: .whitespacesAndNewlines)
        if txt.isEmpty { currentIdx += 1; speakQueueNext(); return }
        onIndex?(currentIdx)
        DispatchQueue.main.async {
            let u = AVSpeechUtterance(string: txt)
            u.rate = 0.5; u.volume = 1.0; u.preUtteranceDelay = 0; u.postUtteranceDelay = 0.01
            if let v = self.bestVoice() { u.voice = v } else { u.voice = AVSpeechSynthesisVoice(language: "ko-KR") }
            self.synth.speak(u)
            self.onState?("playing")
        }
    }

    func pause() { DispatchQueue.main.async { self.synth.pauseSpeaking(at: .word); self.onState?("paused") } }
    func resume() { DispatchQueue.main.async { self.keepAlive(); self.synth.continueSpeaking(); self.onState?("playing") } }
    func resumeIfPaused() {
        DispatchQueue.main.async {
            if !self.synth.isSpeaking && self.isQueueMode {
                self.keepAlive()
                self.speakQueueNext()
            } else {
                self.keepAlive()
                self.synth.continueSpeaking()
                self.onState?("playing")
            }
        }
    }
    func stop() { DispatchQueue.main.async { self.isQueueMode = false; self.queue = []; self.synth.stopSpeaking(at: .immediate); self.onState?("stopped") } }

    // 단어 단위 하이라이트 핵심
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString range: NSRange, utterance: AVSpeechUtterance) {
        keepAlive()
        onWord?(currentIdx, range.location, range.length)
    }

    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        keepAlive()
        if isQueueMode {
            currentIdx += 1
            speakQueueNext()
        } else {
            onState?("finished")
        }
    }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) { keepAlive(); onState?("playing") }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { onState?("stopped") }
}
