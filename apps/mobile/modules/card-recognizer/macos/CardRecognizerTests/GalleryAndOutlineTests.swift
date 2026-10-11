import CardRecognizer
import CoreGraphics
import Testing

@Test("matches a collector number with leading zeros and any case")
func matchesACollectorNumberWithLeadingZerosAndAnyCase() {
  #expect(Gallery.key(set: "ELD", collectorNumber: "008") == Gallery.key(set: "eld", collectorNumber: "8"))
}

@Test("turns a sideways outline upright")
func turnsASidewaysOutlineUpright() {
  let outline = CardOutline(corners: [
    CGPoint(x: 0.1, y: 0.3), CGPoint(x: 0.9, y: 0.3), CGPoint(x: 0.9, y: 0.7), CGPoint(x: 0.1, y: 0.7),
  ]).portraitOrdered(imageWidth: 1000, imageHeight: 1000)
  #expect(outline.topLeft == CGPoint(x: 0.1, y: 0.7))
  #expect(outline.topRight == CGPoint(x: 0.1, y: 0.3))
}

@Test("keeps an upright card in a tall photo upright")
func keepsAnUprightCardInATallPhotoUpright() {
  let outline = CardOutline(corners: [
    CGPoint(x: 0.2, y: 0.25), CGPoint(x: 0.8, y: 0.25), CGPoint(x: 0.8, y: 0.75), CGPoint(x: 0.2, y: 0.75),
  ]).portraitOrdered(imageWidth: 2376, imageHeight: 4224)
  #expect(outline.topLeft == CGPoint(x: 0.2, y: 0.25))
}

@Test("takes the title key from the front face")
func takesTheTitleKeyFromTheFrontFace() {
  #expect(CardRecognizer.titleKey("Beanstalk Giant // Fertile Footsteps") == "beanstalkgiant")
}

@Test("gives short text no title key")
func givesShortTextNoTitleKey() {
  #expect(CardRecognizer.titleKey("3") == "")
}
