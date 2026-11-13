@main
struct CameraStatusTests {
  static func main() {
    unavailableCameraNeverClaimsDetectionOrEnablesRecognition()
    onlyARunningDetectedCardEnablesRecognition()
    print("Camera status presentation: 2 tests passed")
  }

  static func unavailableCameraNeverClaimsDetectionOrEnablesRecognition() {
    for running in [false, true] {
      let status = CameraStatus(
        available: false, running: running, detected: true, failed: false)
      precondition(status.rawValue == "Camera unavailable")
      precondition(status.actionValue == "Camera unavailable")
      precondition(!status.canRecognize)
    }
  }

  static func onlyARunningDetectedCardEnablesRecognition() {
    let stopped = CameraStatus(available: true, running: false, detected: true, failed: false)
    let empty = CameraStatus(available: true, running: true, detected: false, failed: false)
    let detected = CameraStatus(available: true, running: true, detected: true, failed: false)
    let failed = CameraStatus(available: true, running: true, detected: true, failed: true)
    precondition(stopped == .stopped && !stopped.canRecognize)
    precondition(empty == .noCard && empty.actionValue == "Running" && !empty.canRecognize)
    precondition(detected == .detected && detected.canRecognize)
    precondition(failed == .failed && !failed.canRecognize)
  }
}
