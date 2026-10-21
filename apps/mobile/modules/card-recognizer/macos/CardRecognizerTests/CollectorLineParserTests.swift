import CardRecognizer
import Testing

let setCodes: Set<String> = ["eld", "sos", "jou", "sld", "rna", "m15", "dsc", "mkc", "ktk"]

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
  #expect(reading.setTokens == ["zix"])
  #expect(reading.collectorNumber == "25")
}

@Test("reads a four digit secret lair number")
func readsAFourDigitSecretLairNumber() {
  let reading = parse(["flowing.", "7096", "7M11", "x c 2026 Wwards nf the Couxt", "SLD * EN I IOANNIS FIORE"])
  #expect(reading.setCode == "sld")
  #expect(reading.collectorNumber == "7096")
  #expect(reading.premiumMark)
}

@Test("reads a set code whose first letter was dropped")
func readsASetCodeWhoseFirstLetterWasDropped() {
  #expect(parse(["0038/269 C", "OS • EN Craig Elliott"]).setCode(among: ["sos", "soa", "tdm"]) == "sos")
  #expect(parse(["LD • EN Randy Vargas"]).setCode(among: ["eld", "woe"]) == "eld")
  #expect(parse(["150/274 C", "21 • EN Svetlin Velinov"]).setCode(among: ["m21", "m20", "fdn"]) == "m21")
  #expect(parse(["136/269 C", "15 - EN Dan Dos Santos"]).setCode(among: ["m15", "m14"]) == "m15")
}

@Test("reads a set code with a space inside it")
func readsASetCodeWithASpaceInsideIt() {
  #expect(parse(["136/269 C", "M 15 • EN Dan Dos Santos"]).setCode(among: ["m15", "m14"]) == "m15")
}

@Test("reads a set code before a plus, a hash, or no separator")
func readsASetCodeBeforeAPlusAHashOrNoSeparator() {
  #expect(parse(["R 2464", "SLD + EN Artist"]).setCode(among: ["sld", "plst"]) == "sld")
  #expect(parse(["C 0038", "SOS # EN Craig Elliott"]).setCode(among: ["sos", "soa"]) == "sos")
  #expect(parse(["DSCEN Artist"]).setCode(among: ["dsc", "dsk"]) == "dsc")
}

@Test("reads Cyrillic look-alike letters as Latin")
func readsCyrillicLookAlikeLettersAsLatin() {
  #expect(parse(["0108/0286 R", "МКС • EN Artist"]).setCode == "mkc")
  #expect(parse(["028/269 C", "КТК • EN Artist"]).setCode == "ktk")
}

@Test("reads a set code with a stray digit before the language code")
func readsASetCodeWithAStrayDigitBeforeTheLanguageCode() {
  #expect(parse(["150/274 C", "M21 - 2EN Svetlin Velinov"]).setCode(among: ["m21", "fdn"]) == "m21")
}

@Test("reads a set code with look-alike characters")
func readsASetCodeWithLookAlikeCharacters() {
  #expect(parse(["136/269 C", "MT5 EN Dan Dos Santos"]).setCode(among: ["m15", "m14"]) == "m15")
}

@Test("reads a set code with one wrong character")
func readsASetCodeWithOneWrongCharacter() {
  #expect(parse(["162/280 C", "120 • EN Artist"]).setCode(among: ["m20", "fdn"]) == "m20")
  #expect(parse(["136/269 C", "MP5- EN Dan Dos Santos"]).setCode(among: ["m15", "fdn"]) == "m15")
  #expect(parse(["R 2464", "SLO • EN Artist"]).setCode(among: ["sld", "plst"]) == "sld")
  #expect(parse(["008/269 R", "2LD • EN Randy Vargas"]).setCode(among: ["eld", "woe"]) == "eld")
}

@Test("reads a set code whose separator was read as a character")
func readsASetCodeWhoseSeparatorWasReadAsACharacter() {
  #expect(parse(["M210 EN Svetlin Velinov"]).setCode(among: ["m21", "fdn"]) == "m21")
}

@Test("reads no collector number from the language line")
func readsNoCollectorNumberFromTheLanguageLine() {
  let reading = parse(["M210 EN Svetlin Velinov", "™ & © 2020 Wizards of the Coast"])
  #expect(reading.collectorNumber == nil)
}

@Test("reads a set code that matches two sets equally as no set code")
func readsASetCodeThatMatchesTwoSetsEquallyAsNoSetCode() {
  #expect(parse(["21 • EN Svetlin Velinov"]).setCode(among: ["m21", "j21"]) == nil)
}

@Test("marks a number read before a rarity letter")
func marksANumberReadBeforeARarityLetter() {
  let reading = parse(["269 C", "M15 • EN Dan Dos Santos"])
  #expect(reading.setCode == "m15")
  #expect(reading.collectorNumber == "269")
  #expect(reading.numberBeforeRarity)
  #expect(!parse(["136/269 C", "M15 • EN Dan Dos Santos"]).numberBeforeRarity)
}

@Test("reads no set code from text without a language code or in lowercase")
func readsNoSetCodeFromTextWithoutALanguageCodeOrInLowercase() {
  #expect(parse(["Ltm-ut, the vecromance", "Illus. Rick Emond"]).setTokens.isEmpty)
  #expect(parse(["oeaen ja cy wna novoes.", "• Nils Hamm"]).setTokens.isEmpty)
}
