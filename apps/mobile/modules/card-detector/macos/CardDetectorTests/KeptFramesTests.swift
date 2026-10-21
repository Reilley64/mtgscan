import CoreVideo
import simd
import Testing

@testable import CardDetector

private func outline(_ x: Double) -> [SIMD2<Double>] {
  [SIMD2(x, 0.1), SIMD2(x + 0.5, 0.1), SIMD2(x + 0.5, 0.8), SIMD2(x, 0.8)]
}

@Test("finds the frame that held still after later frames with other outlines")
func findsTheHeldStillFrameAfterLaterFrames() {
  var frames = KeptFrames<String>()
  frames.keep("held still", outline: outline(0.2), seconds: 10.0)
  frames.keep("later", outline: outline(0.21), seconds: 10.2)
  frames.keep("latest", outline: outline(0.22), seconds: 10.4)
  #expect(frames.frame(withOutline: outline(0.2)) == "held still")
  #expect(frames.frame(withOutline: outline(0.22)) == "latest")
}

@Test("finds the latest frame with an outline when two frames have it")
func findsTheLatestFrameWithAnOutline() {
  var frames = KeptFrames<String>()
  frames.keep("first", outline: outline(0.2), seconds: 10.0)
  frames.keep("second", outline: outline(0.2), seconds: 10.2)
  #expect(frames.frame(withOutline: outline(0.2)) == "second")
}

@Test("forgets frames more than a second older than the latest kept frame")
func forgetsOldFrames() {
  var frames = KeptFrames<String>()
  frames.keep("old", outline: outline(0.2), seconds: 10.0)
  frames.keep("recent", outline: outline(0.3), seconds: 10.8)
  frames.keep("latest", outline: outline(0.4), seconds: 11.1)
  #expect(frames.frame(withOutline: outline(0.2)) == nil)
  #expect(frames.frame(withOutline: outline(0.3)) == "recent")
}

@Test("finds no frame for an outline that no kept frame has")
func findsNoFrameForAnotherOutline() {
  var frames = KeptFrames<String>()
  frames.keep("only", outline: outline(0.2), seconds: 10.0)
  #expect(frames.frame(withOutline: outline(0.25)) == nil)
}

@Test("copies a frame into a new buffer with the same pixels")
func copiesAFrame() throws {
  let card = SyntheticCard(center: SIMD2(360, 620), width: 400, angle: 0.05)
  let frame = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 185), orientation: .right)
  let copy = try #require(copiedPlanes(of: frame))
  #expect(copy !== frame)
  #expect(planeBytes(copy) == planeBytes(frame))
}

private func planeBytes(_ buffer: CVPixelBuffer) -> [[UInt8]] {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  return (0 ..< CVPixelBufferGetPlaneCount(buffer)).map { plane in
    let base = CVPixelBufferGetBaseAddressOfPlane(buffer, plane)!.assumingMemoryBound(to: UInt8.self)
    let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, plane)
    let rowBytes = CVPixelBufferGetWidthOfPlane(buffer, plane) * (plane == 0 ? 1 : 2)
    return (0 ..< CVPixelBufferGetHeightOfPlane(buffer, plane)).flatMap { row in
      Array(UnsafeBufferPointer(start: base + row * stride, count: rowBytes))
    }
  }
}
