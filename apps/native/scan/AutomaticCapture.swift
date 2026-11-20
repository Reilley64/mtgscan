import Foundation

struct ScanDetection: Sendable {
  let detected: Bool
  let corners: [SIMD2<Double>]?
  let proposalCorners: [SIMD2<Double>]?
  let confidence: Double
  let signature: [Double]
  let frameWidth: Double
  let frameHeight: Double
  let sampledAtMs: Double
  let failed: Bool
}

struct AutomaticCapture {
  private enum Phase { case seeking, holding, capturing, cooldown, error }
  private var phase: Phase = .seeking
  private var holdStartedAt: Double?
  private var departureStartedAt: Double?
  private var previousCorners: [SIMD2<Double>]?
  private var capturedSignature: [Double]?
  private var lastSampledAt: Double?
  private var failedPhotos = 0

  var stopped: Bool { phase == .error }

  mutating func observe(_ sample: ScanDetection) -> Bool {
    if sample.failed {
      phase = .error
      lastSampledAt = sample.sampledAtMs
      return false
    }
    let resumed = lastSampledAt.map { sample.sampledAtMs - $0 > 1000 } ?? false
    if resumed {
      if phase == .holding { seek() }
      if phase == .cooldown { departureStartedAt = nil }
    }
    let corners = sample.corners?.map { SIMD2($0.x * sample.frameWidth, $0.y * sample.frameHeight) }
    let motion = Self.motion(resumed ? nil : previousCorners, corners)
    let correlation = sample.detected ? Self.correlation(capturedSignature, sample.signature) : nil
    let cardEvidence =
      sample.detected
      || (sample.proposalCorners != nil && sample.confidence >= 0.6
        && Self.area(sample.proposalCorners) <= 0.6)
    let changed = sample.detected && correlation.map { $0 < 0.6 } == true
    let departed = !cardEvidence || changed
    previousCorners = corners
    lastSampledAt = sample.sampledAtMs
    switch phase {
    case .error, .capturing: return false
    case .cooldown:
      guard departed else {
        departureStartedAt = nil
        return false
      }
      let start = departureStartedAt ?? sample.sampledAtMs
      departureStartedAt = start
      if sample.sampledAtMs - start >= 1000 { seek() }
      return false
    case .holding, .seeking:
      guard sample.detected, let motion, motion <= 0.04 else {
        seek()
        return false
      }
      let start = holdStartedAt ?? sample.sampledAtMs
      holdStartedAt = start
      guard sample.sampledAtMs - start >= 400 else {
        phase = .holding
        return false
      }
      phase = .capturing
      capturedSignature = sample.signature
      return true
    }
  }

  mutating func photoTaken() {
    guard phase == .capturing else { return }
    phase = .cooldown
    departureStartedAt = nil
    failedPhotos = 0
  }

  mutating func photoFailed() {
    guard phase == .capturing else { return }
    failedPhotos += 1
    seek()
    previousCorners = nil
    if failedPhotos >= 3 { phase = .error }
  }

  mutating func retry() { self = AutomaticCapture() }

  private mutating func seek() {
    phase = .seeking
    holdStartedAt = nil
    departureStartedAt = nil
    capturedSignature = nil
  }

  private static func motion(_ previous: [SIMD2<Double>]?, _ current: [SIMD2<Double>]?) -> Double? {
    guard let previous, let current, previous.count == 4, current.count == 4 else { return nil }
    func length(_ point: SIMD2<Double>) -> Double { hypot(point.x, point.y) }
    func side(_ a: Int, _ b: Int) -> Double { length(current[b] - current[a]) }
    let shortSide = min((side(0, 1) + side(3, 2)) / 2, (side(0, 3) + side(1, 2)) / 2)
    guard shortSide > 0 else { return nil }
    return zip(previous, current).map { length($1 - $0) }.max().map { $0 / shortSide }
  }

  private static func area(_ corners: [SIMD2<Double>]?) -> Double {
    guard let corners, corners.count == 4 else { return 0 }
    return abs(
      corners.indices.reduce(0.0) { result, i in
        let next = corners[(i + 1) % 4]
        return result + corners[i].x * next.y - next.x * corners[i].y
      }) / 2
  }

  private static func gradient(_ signature: [Double]) -> [Double] {
    var values: [Double] = []
    for row in 0..<6 {
      for column in 0..<7 {
        values.append(signature[row * 8 + column + 1] - signature[row * 8 + column])
      }
    }
    for row in 0..<5 {
      for column in 0..<8 {
        values.append(signature[(row + 1) * 8 + column] - signature[row * 8 + column])
      }
    }
    return values
  }

  private static func correlation(_ first: [Double]?, _ second: [Double]) -> Double? {
    guard let first, first.count == 48, second.count == 48 else { return nil }
    let a = gradient(first)
    let b = gradient(second)
    let meanA = a.reduce(0, +) / Double(a.count)
    let meanB = b.reduce(0, +) / Double(b.count)
    var product = 0.0
    var squaresA = 0.0
    var squaresB = 0.0
    for (x, y) in zip(a, b) {
      product += (x - meanA) * (y - meanB)
      squaresA += (x - meanA) * (x - meanA)
      squaresB += (y - meanB) * (y - meanB)
    }
    let scale = sqrt(squaresA * squaresB)
    return scale > 0 ? product / scale : nil
  }
}
