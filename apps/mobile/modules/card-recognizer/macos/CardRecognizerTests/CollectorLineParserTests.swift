import CardRecognizer
import Testing

let setCodes: Set<String> = ["eld", "sos", "jou", "sld", "rna", "m15", "dsc"]

func parse(_ lines: [String]) -> CollectorLine {
  CollectorLineReader.parse(lines: lines, setCodes: setCodes)
}

@Test("reads the set code and number of a modern collector line")
func readsTheSetCodeAndNumberOfAModernCollectorLine() {
  let reading = parse(["control at the beginning of the next", "008/269 R", "ELD • EN Randy Vargas", "™ & © 2019 Wizards of the Coast"])
  #expect(reading.setCode == "eld")
  #expect(reading.collectorNumber == "8")
  #expect(!reading.premiumMark)
}

@Test("reads a rarity first number")
func readsARarityFirstNumber() {
  let reading = parse(["C 0038 Story Spotlight", "SOS • EN Craig Elliott", "™ & © 2026 Wizards of the Coast"])
  #expect(reading.setCode == "sos")
  #expect(reading.collectorNumber == "38")
}

@Test("reads a star as the premium mark")
func readsAStarAsThePremiumMark() {
  let reading = parse(["R 2464", "SLD ★ EN Artist"])
  #expect(reading.setCode == "sld")
  #expect(reading.collectorNumber == "2464")
  #expect(reading.premiumMark)
}

@Test("reads the number at the end of an older copyright line")
func readsTheNumberAtTheEndOfAnOlderCopyrightLine() {
  let reading = parse(["Ryan Barger", "™ & © 2014 Wizards of the Coast 146/165"])
  #expect(reading.setCode == nil)
  #expect(reading.collectorNumber == "146")
}

@Test("does not read the copyright year as a number")
func doesNotReadTheCopyrightYearAsANumber() {
  #expect(parse(["IM & C 2018 Wizards of the Cou"]).collectorNumber == nil)
}

@Test("keeps the number when the set code is unknown")
func keepsTheNumberWhenTheSetCodeIsUnknown() {
  let reading = parse(["005/269 C", "XYZ • EN Someone"])
  #expect(reading.setCode == nil)
  #expect(reading.collectorNumber == "5")
}

@Test("reads a number on its own line")
func readsANumberOnItsOwnLine() {
  let reading = parse(["*/*", "295", "U", "IN & O 2019 Wizards of the Coast", "ELD • EN NICK SOUTHAM"])
  #expect(reading.setCode == "eld")
  #expect(reading.collectorNumber == "295")
}

@Test("needs a two or three digit total for a fraction")
func needsATwoOrThreeDigitTotalForAFraction() {
  #expect(parse(["5/4", "1M& 0/2014 Wizards of the Coast 146/165"]).collectorNumber == "146")
}

@Test("keeps an unknown set token for the nearby set rule")
func keepsAnUnknownSetTokenForTheNearbySetRule() {
  let reading = parse(["25/196 C", "ZIX. EN IESPER EISING"])
  #expect(reading.setCode == nil)
  #expect(reading.setToken == "zix")
  #expect(reading.collectorNumber == "25")
}

@Test("reads a four digit secret lair number")
func readsAFourDigitSecretLairNumber() {
  let reading = parse(["flowing.", "7096", "7M11", "x c 2026 Wwards nf the Couxt", "SLD * EN I IOANNIS FIORE"])
  #expect(reading.setCode == "sld")
  #expect(reading.collectorNumber == "7096")
  #expect(reading.premiumMark)
}
