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

check(MTGCardCatalog.key(set: "ELD", collectorNumber: "008") == MTGCardCatalog.key(set: "eld", collectorNumber: "8"), "catalog key")

let sideways = MTGCardQuad(corners: [
  CGPoint(x: 0.1, y: 0.3), CGPoint(x: 0.9, y: 0.3), CGPoint(x: 0.9, y: 0.7), CGPoint(x: 0.1, y: 0.7),
]).portraitOrdered()
check(sideways.topLeft == CGPoint(x: 0.1, y: 0.7) && sideways.topRight == CGPoint(x: 0.1, y: 0.3), "sideways quad \(sideways)")

if failures > 0 {
  print("\(failures) checks failed")
  exit(1)
}
print("all checks passed")
