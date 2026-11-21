import CoreVideo
import Foundation
import simd

struct KeptFrames<Frame> {
  static var keptSeconds: Double { 1.0 }

  private var kept: [(frame: Frame, outline: [SIMD2<Double>], seconds: Double)] = []

  mutating func keep(_ frame: Frame, outline: [SIMD2<Double>], seconds: Double) {
    kept.removeAll { seconds - $0.seconds > Self.keptSeconds }
    kept.append((frame, outline, seconds))
  }

  func frame(withOutline outline: [SIMD2<Double>]) -> Frame? {
    kept.last { $0.outline == outline }?.frame
  }
}

func copiedPlanes(of source: CVPixelBuffer) -> CVPixelBuffer? {
  var created: CVPixelBuffer?
  guard CVPixelBufferCreate(
    kCFAllocatorDefault,
    CVPixelBufferGetWidth(source),
    CVPixelBufferGetHeight(source),
    CVPixelBufferGetPixelFormatType(source),
    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary,
    &created
  ) == kCVReturnSuccess, let copy = created,
    CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess
  else {
    return nil
  }
  defer { CVPixelBufferUnlockBaseAddress(source, .readOnly) }
  guard CVPixelBufferLockBaseAddress(copy, []) == kCVReturnSuccess else {
    return nil
  }
  defer { CVPixelBufferUnlockBaseAddress(copy, []) }
  for plane in 0 ..< CVPixelBufferGetPlaneCount(source) {
    guard let from = CVPixelBufferGetBaseAddressOfPlane(source, plane),
          let to = CVPixelBufferGetBaseAddressOfPlane(copy, plane)
    else {
      return nil
    }
    let fromStride = CVPixelBufferGetBytesPerRowOfPlane(source, plane)
    let toStride = CVPixelBufferGetBytesPerRowOfPlane(copy, plane)
    for row in 0 ..< CVPixelBufferGetHeightOfPlane(source, plane) {
      memcpy(to + row * toStride, from + row * fromStride, min(fromStride, toStride))
    }
  }
  if let attachments = CVBufferCopyAttachments(source, .shouldPropagate) {
    CVBufferSetAttachments(copy, attachments, .shouldPropagate)
  }
  return copy
}
