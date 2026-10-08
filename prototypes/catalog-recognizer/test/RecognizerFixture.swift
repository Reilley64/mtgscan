import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String) {
  if !condition {
    failures += 1
    print("FAIL: \(message)")
  }
}

let setCodes: Set<String> = ["eld", "sos", "jou", "sld", "rna", "m15", "dsc"]

let modern = MTGCollectorLineReader.parse(
  lines: ["control at the beginning of the next", "008/269 R", "ELD • EN Randy Vargas", "™ & © 2019 Wizards of the Coast"],
  setCodes: setCodes
)
check(modern.setCode == "eld" && modern.collectorNumber == "8" && !modern.premiumMark, "modern line \(modern)")

let newStyle = MTGCollectorLineReader.parse(
  lines: ["C 0038 Story Spotlight", "SOS • EN Craig Elliott", "™ & © 2026 Wizards of the Coast"],
  setCodes: setCodes
)
check(newStyle.setCode == "sos" && newStyle.collectorNumber == "38", "rarity-number line \(newStyle)")

let premium = MTGCollectorLineReader.parse(lines: ["R 2464", "SLD ★ EN Artist"], setCodes: setCodes)
check(premium.setCode == "sld" && premium.collectorNumber == "2464" && premium.premiumMark, "premium star \(premium)")

let oldFrame = MTGCollectorLineReader.parse(
  lines: ["Ryan Barger", "™ & © 2014 Wizards of the Coast 146/165"],
  setCodes: setCodes
)
check(oldFrame.setCode == nil && oldFrame.collectorNumber == "146", "old copyright number \(oldFrame)")

let copyrightYear = MTGCollectorLineReader.parse(lines: ["IM & C 2018 Wizards of the Cou"], setCodes: setCodes)
check(copyrightYear.collectorNumber == nil, "copyright year is not a number \(copyrightYear)")

let unknownSet = MTGCollectorLineReader.parse(lines: ["005/269 C", "XYZ • EN Someone"], setCodes: setCodes)
check(unknownSet.setCode == nil && unknownSet.collectorNumber == "5", "unknown set code \(unknownSet)")

let numberAlone = MTGCollectorLineReader.parse(lines: ["*/*", "295", "U", "IN & O 2019 Wizards of the Coast", "ELD • EN NICK SOUTHAM"], setCodes: setCodes)
check(numberAlone.setCode == "eld" && numberAlone.collectorNumber == "295", "number on its own line \(numberAlone)")

let yearFraction = MTGCollectorLineReader.parse(lines: ["5/4", "1M& 0/2014 Wizards of the Coast 146/165"], setCodes: setCodes)
check(yearFraction.collectorNumber == "146", "copyright year is not a fraction \(yearFraction)")

let misreadSet = MTGCollectorLineReader.parse(lines: ["25/196 C", "ZIX. EN IESPER EISING"], setCodes: setCodes)
check(misreadSet.setCode == nil && misreadSet.setToken == "zix" && misreadSet.collectorNumber == "25", "unknown set token kept \(misreadSet)")

let secretLair = MTGCollectorLineReader.parse(lines: ["flowing.", "7096", "7M11", "x c 2026 Wwards nf the Couxt", "SLD * EN I IOANNIS FIORE"], setCodes: setCodes)
check(secretLair.setCode == "sld" && secretLair.collectorNumber == "7096" && secretLair.premiumMark, "secret lair number \(secretLair)")

check(MTGCardCatalog.key(set: "ELD", collectorNumber: "008") == MTGCardCatalog.key(set: "eld", collectorNumber: "8"), "catalog key")

let sideways = MTGCardQuad(corners: [
  CGPoint(x: 0.1, y: 0.3), CGPoint(x: 0.9, y: 0.3), CGPoint(x: 0.9, y: 0.7), CGPoint(x: 0.1, y: 0.7),
]).portraitOrdered(imageWidth: 1000, imageHeight: 1000)
check(sideways.topLeft == CGPoint(x: 0.1, y: 0.7) && sideways.topRight == CGPoint(x: 0.1, y: 0.3), "sideways quad \(sideways)")

let portraitInTallPhoto = MTGCardQuad(corners: [
  CGPoint(x: 0.2, y: 0.25), CGPoint(x: 0.8, y: 0.25), CGPoint(x: 0.8, y: 0.75), CGPoint(x: 0.2, y: 0.75),
]).portraitOrdered(imageWidth: 2376, imageHeight: 4224)
check(portraitInTallPhoto.topLeft == CGPoint(x: 0.2, y: 0.25), "portrait card in a tall photo stays upright \(portraitInTallPhoto)")

if failures > 0 {
  print("\(failures) checks failed")
  exit(1)
}
print("all checks passed")
