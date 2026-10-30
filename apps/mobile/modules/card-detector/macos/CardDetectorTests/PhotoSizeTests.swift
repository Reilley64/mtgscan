import CoreMedia
import simd
import Testing

@testable import CardDetector

private let sizes = [
  CMVideoDimensions(width: 4224, height: 2376),
  CMVideoDimensions(width: 1280, height: 720),
  CMVideoDimensions(width: 3840, height: 2160),
]

private func outline(width: Double, height: Double) -> [SIMD2<Double>] {
  [SIMD2(0.2, 0.2), SIMD2(0.2 + width, 0.2), SIMD2(0.2 + width, 0.2 + height), SIMD2(0.2, 0.2 + height)]
}

@Test("takes the smallest photo size that gives the card the recognizer's read size")
func takesTheSmallestPhotoSizeThatReadsTheCard() {
  let size = PhotoSize.smallest(of: sizes, orientation: .right, readingCard: outline(width: 0.56, height: 0.44))
  #expect(size?.width == 3840)
  #expect(size?.height == 2160)
}

@Test("takes the largest photo size when no size gives the card the recognizer's read size")
func takesTheLargestPhotoSizeForASmallCard() {
  let size = PhotoSize.smallest(of: sizes, orientation: .right, readingCard: outline(width: 0.45, height: 0.35))
  #expect(size?.width == 4224)
  #expect(size?.height == 2376)
}

@Test("takes a larger photo size when only the card's width falls short of the recognizer's read width")
func takesALargerPhotoSizeForANarrowCard() {
  let size = PhotoSize.smallest(of: sizes, orientation: .right, readingCard: outline(width: 0.52, height: 0.44))
  #expect(size?.width == 4224)
  #expect(size?.height == 2376)
}
