import CoreGraphics
import Foundation
import Vision
import simd

private let imageSize = 1_000
private let roiX = 0.1
private let roiYUpperLeft = 0.1
private let roiWidth = 0.8
private let roiHeight = 0.8

private func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  guard condition() else {
    fputs("native geometry fixture failed: \(message)\n", stderr)
    exit(1)
  }
}

private func isNear(_ actual: Double, _ expected: Double, tolerance: Double = 0.02) -> Bool {
  abs(actual - expected) <= tolerance
}

private func assertPoint(_ actual: CGPoint, x: Double, y: Double, _ label: String) {
  require(isNear(actual.x, x) && isNear(actual.y, y), "\(label) was \(actual), expected (\(x), \(y))")
}

private func fixtureImage() -> CGImage {
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  guard let context = CGContext(
    data: nil,
    width: imageSize,
    height: imageSize,
    bitsPerComponent: 8,
    bytesPerRow: imageSize * 4,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fatalError("could not create fixture context")
  }

  context.setFillColor(CGColor(gray: 1.0, alpha: 1.0))
  context.fill(CGRect(x: 0, y: 0, width: imageSize, height: imageSize))
  context.setStrokeColor(CGColor(gray: 0.0, alpha: 1.0))
  context.setLineWidth(8)
  context.stroke(CGRect(x: 300, y: 200, width: 400, height: 600))

  guard let image = context.makeImage() else {
    fatalError("could not create fixture image")
  }
  return image
}

let request = VNDetectContoursRequest()
request.regionOfInterest = CGRect(x: roiX, y: roiYUpperLeft, width: roiWidth, height: roiHeight)
request.maximumImageDimension = 256
request.contrastAdjustment = 2.0
request.detectsDarkOnLight = true

do {
  try VNImageRequestHandler(cgImage: fixtureImage(), options: [:]).perform([request])
} catch {
  fputs("native geometry fixture Vision failure: \(error)\n", stderr)
  exit(1)
}

guard let observation = request.results?.first else {
  fputs("native geometry fixture failed: no contours observation\n", stderr)
  exit(1)
}

var candidates: [MTGCardRectangleGeometry.Candidate] = []
for index in 0 ..< min(observation.contourCount, 32) {
  do {
    let contour = try observation.contour(at: index)
    let approximation = try contour.polygonApproximation(epsilon: 0.02)
    if let candidate = MTGCardRectangleGeometry.candidate(
      localPoints: approximation.normalizedPoints,
      roiX: roiX,
      roiYUpperLeft: roiYUpperLeft,
      roiWidth: roiWidth,
      roiHeight: roiHeight,
      orientedWidth: Double(imageSize),
      orientedHeight: Double(imageSize)
    ) {
      candidates.append(candidate)
    }
  } catch {
    continue
  }
}

require(observation.contourCount >= 2, "expected outer and inset contours")
require(candidates.count >= 2, "expected two valid quadrilateral candidates")
let rankedCandidates = candidates.sorted { $0.areaRatio > $1.areaRatio }
let selected = rankedCandidates[0]
require(selected.areaRatio > rankedCandidates[1].areaRatio, "outer contour did not beat inset contour")
assertPoint(selected.topLeft, x: 0.30, y: 0.20, "top left")
assertPoint(selected.topRight, x: 0.70, y: 0.20, "top right")
assertPoint(selected.bottomRight, x: 0.70, y: 0.80, "bottom right")
assertPoint(selected.bottomLeft, x: 0.30, y: 0.80, "bottom left")

let closingFive = [
  simd_float2(0.25, 0.875),
  simd_float2(0.75, 0.875),
  simd_float2(0.75, 0.125),
  simd_float2(0.25, 0.125),
  simd_float2(0.251, 0.874),
]
let nonclosingFive = [
  simd_float2(0.25, 0.875),
  simd_float2(0.75, 0.875),
  simd_float2(0.75, 0.125),
  simd_float2(0.25, 0.125),
  simd_float2(0.50, 0.50),
]
require(MTGCardRectangleGeometry.acceptedLocalPoints(closingFive)?.count == 4, "closing fifth point was rejected")
require(MTGCardRectangleGeometry.acceptedLocalPoints(nonclosingFive) == nil, "nonclosing fifth point was accepted")

let unorderedLocalPoints = [
  simd_float2(0.75, 0.125),
  simd_float2(0.25, 0.875),
  simd_float2(0.25, 0.125),
  simd_float2(0.75, 0.875),
]
guard let orderedCandidate = MTGCardRectangleGeometry.candidate(
  localPoints: unorderedLocalPoints,
  roiX: roiX,
  roiYUpperLeft: roiYUpperLeft,
  roiWidth: roiWidth,
  roiHeight: roiHeight,
  orientedWidth: Double(imageSize),
  orientedHeight: Double(imageSize)
) else {
  fputs("native geometry fixture failed: unordered card candidate rejected\n", stderr)
  exit(1)
}
assertPoint(orderedCandidate.topLeft, x: 0.30, y: 0.20, "ordered top left")
assertPoint(orderedCandidate.bottomRight, x: 0.70, y: 0.80, "ordered bottom right")

let asymmetricLocalPoints = [
  simd_float2(0.30, 0.80),
  simd_float2(0.65, 0.72),
  simd_float2(0.70, 0.10),
  simd_float2(0.25, 0.18),
]
guard let asymmetricCandidate = MTGCardRectangleGeometry.candidate(
  localPoints: asymmetricLocalPoints,
  roiX: roiX,
  roiYUpperLeft: roiYUpperLeft,
  roiWidth: roiWidth,
  roiHeight: roiHeight,
  orientedWidth: Double(imageSize),
  orientedHeight: Double(imageSize)
) else {
  fputs("native geometry fixture failed: asymmetric card candidate rejected\n", stderr)
  exit(1)
}
assertPoint(asymmetricCandidate.topLeft, x: 0.34, y: 0.26, "asymmetric top left")
assertPoint(asymmetricCandidate.topRight, x: 0.62, y: 0.324, "asymmetric top right")
assertPoint(asymmetricCandidate.bottomRight, x: 0.66, y: 0.82, "asymmetric bottom right")
assertPoint(asymmetricCandidate.bottomLeft, x: 0.30, y: 0.756, "asymmetric bottom left")

print("native geometry fixture passed: \(observation.contourCount) contours, outer area \(selected.areaRatio)")
