import Foundation

struct AutomaticCaptureTests {
  static func sample(_ time: Double, present: Bool = true, signature: [Double] = [])
    -> ScanDetection
  {
    ScanDetection(
      detected: present,
      corners: present
        ? [SIMD2(0.2, 0.1), SIMD2(0.6, 0.1), SIMD2(0.6, 0.7), SIMD2(0.2, 0.7)] : nil,
      proposalCorners: nil, confidence: 1, signature: signature, frameWidth: 1000,
      frameHeight: 1000, sampledAtMs: time, failed: false)
  }

  static func gapsAndMotionRequireANewHold() {
    var capture = AutomaticCapture()
    for time in [0.0, 200, 400] { precondition(!capture.observe(sample(time))) }
    precondition(!capture.observe(sample(1600)), "A resumed stream cannot complete a stale hold")
    precondition(!capture.observe(sample(1800)))
    precondition(!capture.observe(sample(2000)))
    let old = sample(2200)
    let moved = ScanDetection(
      detected: true, corners: old.corners?.map { $0 + SIMD2(0.1, 0) },
      proposalCorners: nil, confidence: 1, signature: [], frameWidth: 1000, frameHeight: 1000,
      sampledAtMs: 2200, failed: false)
    precondition(!capture.observe(moved), "Motion resets the hold")
    precondition(!capture.observe(sample(2400)))
    for time in [2600.0, 2800] { precondition(!capture.observe(sample(time))) }
    precondition(capture.observe(sample(3000)))
  }

  static func changedCardsRearmWithoutAVisibleGap() {
    var capture = AutomaticCapture()
    let first = (0..<48).map(Double.init)
    let different = first.map { -$0 }
    for time in [0.0, 200, 400] { precondition(!capture.observe(sample(time, signature: first))) }
    precondition(capture.observe(sample(600, signature: first)))
    capture.photoTaken()
    for time in stride(from: 800.0, through: 1800, by: 200) {
      precondition(!capture.observe(sample(time, signature: different)))
    }
    precondition(!capture.observe(sample(2000, signature: different)))
    precondition(!capture.observe(sample(2200, signature: different)))
    precondition(
      capture.observe(sample(2400, signature: different)),
      "A different signature re-arms after 1000 ms")
  }

  static func proposalsKeepTheSameCardLocked() {
    var capture = AutomaticCapture()
    for time in [0.0, 200, 400] { precondition(!capture.observe(sample(time))) }
    precondition(capture.observe(sample(600)))
    capture.photoTaken()
    for time in stride(from: 800.0, through: 2200, by: 200) {
      let proposal = ScanDetection(
        detected: false, corners: nil, proposalCorners: sample(time).corners,
        confidence: 0.7, signature: [], frameWidth: 1000, frameHeight: 1000, sampledAtMs: time,
        failed: false)
      precondition(!capture.observe(proposal))
    }
    for time in [2400.0, 2600, 2800, 3000, 3200] {
      precondition(!capture.observe(sample(time)), "A strong card proposal is not a departure")
    }
  }

  static func failuresStopAndRetry() {
    var capture = AutomaticCapture()
    for attempt in 0..<3 {
      let start = Double(attempt * 1000)
      for time in [start, start + 200, start + 400] { precondition(!capture.observe(sample(time))) }
      precondition(capture.observe(sample(start + 600)))
      capture.photoFailed()
      precondition(
        capture.stopped == (attempt == 2), "Only three consecutive photo failures stop capture")
    }
    capture.retry()
    precondition(!capture.stopped)
    for time in [4000.0, 4200, 4400] { precondition(!capture.observe(sample(time))) }
    precondition(capture.observe(sample(4600)))
  }

  static func holdAndDeparture() {
    var capture = AutomaticCapture()
    for time in [0.0, 200, 400, 599] {
      precondition(
        !capture.observe(sample(time)), "Capture waits for 400 ms of stable observations")
    }
    precondition(capture.observe(sample(600)), "Capture starts at a 400 ms hold")
    capture.photoTaken()
    precondition(!capture.observe(sample(800)), "Same card remains locked")
    for time in stride(from: 1000.0, through: 2000, by: 200) {
      precondition(!capture.observe(sample(time, present: false)))
    }
    for time in [2200.0, 2400, 2600] { precondition(!capture.observe(sample(time))) }
    precondition(capture.observe(sample(2800)), "A full second of departure re-arms capture")
  }
}
