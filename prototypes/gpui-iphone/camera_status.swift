enum CameraStatus: String {
  case stopped = "Stopped"
  case starting = "Starting"
  case noCard = "No card detected"
  case detected = "Card detected"
  case failed = "Camera failed"
  case unavailable = "Camera unavailable"
  case denied = "Camera permission denied"

  init(available: Bool, running: Bool, detected: Bool, failed: Bool) {
    guard available else {
      self = .unavailable
      return
    }
    self = running ? (failed ? .failed : (detected ? .detected : .noCard)) : .stopped
  }

  var canRecognize: Bool { self == .detected }

  var actionValue: String {
    self == .noCard || self == .detected ? "Running" : rawValue
  }
}
