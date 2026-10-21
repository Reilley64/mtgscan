@testable import CardRecognizer
import CryptoKit
import Foundation
import Testing

private func zlibCompressed(_ raw: Data) throws -> Data {
  let deflated = try (raw as NSData).compressed(using: .zlib) as Data
  var byteSum: UInt32 = 1
  var runningSum: UInt32 = 0
  for byte in raw {
    byteSum = (byteSum + UInt32(byte)) % 65521
    runningSum = (runningSum + byteSum) % 65521
  }
  let checksum = (runningSum << 16) | byteSum
  return Data([0x78, 0x9C]) + deflated
    + Data([UInt8(checksum >> 24), UInt8((checksum >> 16) & 0xFF), UInt8((checksum >> 8) & 0xFF), UInt8(checksum & 0xFF)])
}

private struct PartFile {
  let name: String
  let kind: String
  let addOn: Int
  let firstRow: Int
  let rowCount: Int
  let raw: Data
}

private func vector(seed: Int) -> [Float] {
  (0 ..< fixtureModel.vectorSize).map { Float(sin(Double($0 * (seed + 1)) * 0.37)) }
}

private func printingRow(_ id: String, name: String) -> [String: Any] {
  [
    "id": id, "oracleId": "oracle-\(id)", "illustrationId": NSNull(), "name": name, "faceNames": [String](),
    "set": "tst", "collectorNumber": id, "frame": "2015", "finishes": ["nonfoil"], "basicLand": false,
  ]
}

private enum MalformedPart: CaseIterable {
  case notZlib
  case truncated
  case longerThanManifest
  case shorterThanManifest
}

private func writeVersion(
  _ parts: [PartFile],
  rows: Int,
  version: String = "20261021-a1b2c3",
  formatVersion: Int = 2,
  thresholds: [String: Any] = ["notACard": 0.689, "orientationMargin": 0.03, "artMargin": 0.025],
  modelSHA256: String = fixtureModel.sha256,
  corrupt: String? = nil,
  malformed: (name: String, kind: MalformedPart)? = nil,
  downloaded: Set<String>? = nil
) throws -> URL {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  var manifestParts: [[String: Any]] = []
  for part in parts {
    var compressed = try zlibCompressed(part.raw)
    var rawBytes = part.raw.count
    switch malformed?.name == part.name ? malformed?.kind : nil {
    case .notZlib: compressed = part.raw
    case .truncated: compressed = compressed.prefix(compressed.count / 2)
    case .longerThanManifest: rawBytes -= 1
    case .shorterThanManifest: rawBytes += 1
    case nil: break
    }
    let sha256 = SHA256.hash(data: compressed).map { String(format: "%02x", $0) }.joined()
    if part.name == corrupt { compressed[compressed.count / 2] ^= 0xFF }
    if downloaded?.contains(part.name) ?? true {
      try compressed.write(to: directory.appendingPathComponent(part.name))
    }
    manifestParts.append([
      "name": part.name, "kind": part.kind, "addOn": part.addOn, "firstRow": part.firstRow, "rowCount": part.rowCount,
      "compressedBytes": compressed.count, "rawBytes": rawBytes, "sha256": sha256,
    ])
  }
  let manifest: [String: Any] = [
    "formatVersion": formatVersion, "version": version, "builtAt": "2026-10-21T09:00:00Z", "rows": rows,
    "model": [
      "name": fixtureModel.name, "sha256": modelSHA256,
      "inputSize": ["width": fixtureModel.inputSize.width, "height": fixtureModel.inputSize.height],
      "vectorSize": fixtureModel.vectorSize,
    ],
    "thresholds": thresholds,
    "parts": manifestParts,
  ]
  try JSONSerialization.data(withJSONObject: manifest).write(to: directory.appendingPathComponent("manifest.json"))
  return directory
}

private func galleryPart(_ name: String, addOn: Int, firstRow: Int, seeds: [Int]) -> PartFile {
  let codes = seeds.flatMap { GalleryEncoding.int8Codes(of: vector(seed: $0)) }
  return PartFile(
    name: name, kind: "gallery", addOn: addOn, firstRow: firstRow, rowCount: seeds.count,
    raw: codes.withUnsafeBufferPointer { Data(buffer: $0) }
  )
}

private func printingListPart(_ name: String, addOn: Int, firstRow: Int, rows: [[String: Any]]) throws -> PartFile {
  PartFile(
    name: name, kind: "printing_list", addOn: addOn, firstRow: firstRow, rowCount: rows.count,
    raw: try JSONSerialization.data(withJSONObject: rows, options: .sortedKeys)
  )
}

private func modelArchive(packagedAs entry: String) throws -> Data {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try FileManager.default.copyItem(at: fixturePackage, to: directory.appendingPathComponent(entry))
  let archive = directory.appendingPathComponent("model.tar")
  let tar = Process()
  tar.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
  tar.arguments = ["--format", "ustar", "--no-mac-metadata", "-cf", archive.path, "-C", directory.path, entry]
  tar.environment = ["COPYFILE_DISABLE": "1"]
  try tar.run()
  tar.waitUntilExit()
  return try Data(contentsOf: archive)
}

private let fixtureModelArchive = try! modelArchive(packagedAs: GalleryFile.modelPackage)

private func modelPart(packagedAs entry: String = GalleryFile.modelPackage) throws -> PartFile {
  let archive = entry == GalleryFile.modelPackage ? fixtureModelArchive : try modelArchive(packagedAs: entry)
  return PartFile(name: "base-model.zlib", kind: "model", addOn: 0, firstRow: 0, rowCount: 0, raw: archive)
}

private func cosine(_ a: [Float], _ b: [Float]) -> Float {
  zip(a, b).reduce(0) { $0 + $1.0 * $1.1 } / (sqrt(a.reduce(0) { $0 + $1 * $1 }) * sqrt(b.reduce(0) { $0 + $1 * $1 }))
}

@Test("an int8 feature print decodes to a unit vector in the same direction")
func anInt8FeaturePrintDecodesToAUnitVectorInTheSameDirection() {
  let original = vector(seed: 3)
  let decoded = GalleryEncoding.int8Codes(of: original).withUnsafeBufferPointer {
    GalleryEncoding.unitVector(of: $0).map { Float($0) }
  }
  #expect(abs(sqrt(decoded.reduce(0) { $0 + $1 * $1 }) - 1) < 0.001)
  #expect(cosine(original, decoded) > 0.9999)
}

@Test("installing a base and an add-on lets a later row replace the earlier one")
func installingABaseAndAnAddOnLetsALaterRowReplaceTheEarlierOne() throws {
  let version = try writeVersion([
    galleryPart("base-gallery-1.zlib", addOn: 0, firstRow: 0, seeds: [0, 1]),
    galleryPart("base-gallery-2.zlib", addOn: 0, firstRow: 2, seeds: [2]),
    try printingListPart("base-printing-list-1.zlib", addOn: 0, firstRow: 0, rows: [
      printingRow("a", name: "Alpha"), printingRow("b", name: "Beta"), printingRow("c", name: "Gamma"),
    ]),
    try modelPart(),
    galleryPart("add-on-1-gallery-1.zlib", addOn: 1, firstRow: 3, seeds: [7, 8]),
    try printingListPart("add-on-1-printing-list-1.zlib", addOn: 1, firstRow: 3, rows: [
      printingRow("b", name: "Beta, new image"), printingRow("d", name: "Delta"),
    ]),
  ], rows: 4)
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  try GalleryInstaller.install(from: version, into: destination)

  let gallery = try Gallery(directory: destination)
  #expect(gallery.printings.map(\.name) == ["Alpha", "Beta, new image", "Gamma", "Delta"])
  let scores = gallery.similarities(to: [vector(seed: 7)])[0]
  #expect(gallery.top(1, of: scores) == [1])
  #expect(scores[1] > 0.999)
}

@Test("the installed gallery takes the model and the thresholds of its gallery version")
func theInstalledGalleryTakesTheModelAndTheThresholdsOfItsGalleryVersion() throws {
  let version = try writeVersion(
    try baseParts(),
    rows: 3,
    thresholds: ["notACard": 0.689, "orientationMargin": 0.03, "artMargin": 0.025]
  )
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  try GalleryInstaller.install(from: version, into: destination)

  let gallery = try Gallery(directory: destination)
  #expect(gallery.model == fixtureModel)
  #expect(gallery.thresholds == RecognizerThresholds(notACard: 0.689, orientationMargin: 0.03, artMargin: 0.025))
}

@Test("installing a base unpacks its model part and compiles it into the installed gallery version")
func installingABaseUnpacksItsModelPartAndCompilesIt() throws {
  let version = try writeVersion(try baseParts(), rows: 3)
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  try GalleryInstaller.install(from: version, into: destination)

  let installed = try FileManager.default.contentsOfDirectory(atPath: destination.path)
  #expect(installed.contains(GalleryFile.compiledModel))
  #expect(!installed.contains(GalleryFile.modelPackage))
  let photo = try card(seed: 1)
  let expected = try fixtureCompiledModel.featurePrint(of: #require(CardRecognizer.small(photo)))
  #expect(cosine(try Gallery(directory: destination).compiledModel.featurePrint(of: #require(CardRecognizer.small(photo))), expected) > 0.9999)
}

@Test("installing refuses a model part whose model SHA-256 differs from the manifest's model")
func installingRefusesAModelPartWhoseSHA256DiffersFromTheManifestsModel() throws {
  let version = try writeVersion(try baseParts(), rows: 3, modelSHA256: String(repeating: "0", count: 64))
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.partMismatch("base-model.zlib")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

@Test("installing refuses a model part with a file outside model.mlpackage")
func installingRefusesAModelPartWithAFileOutsideTheModelPackage() throws {
  let parts = try baseParts().filter { $0.kind != "model" } + [modelPart(packagedAs: "other.mlpackage")]
  let version = try writeVersion(parts, rows: 3)
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.malformedPart("base-model.zlib")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

@Test("installing refuses a base with no model part")
func installingRefusesABaseWithNoModelPart() throws {
  let version = try writeVersion(try baseParts().filter { $0.kind != "model" }, rows: 3)
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.unsupportedManifest("the gallery version has no model part")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

@Test("installing refuses a manifest with an unknown format", arguments: [1, 3])
func installingRefusesAManifestWithAnUnknownFormat(_ formatVersion: Int) throws {
  let version = try writeVersion(try baseParts(), rows: 3, formatVersion: formatVersion)
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.unsupportedManifest("format version \(formatVersion)")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

@Test("installing refuses a part whose SHA-256 does not match the manifest")
func installingRefusesAPartWhoseSHA256DoesNotMatchTheManifest() throws {
  let version = try writeVersion([
    galleryPart("base-gallery-1.zlib", addOn: 0, firstRow: 0, seeds: [0]),
    try printingListPart("base-printing-list-1.zlib", addOn: 0, firstRow: 0, rows: [printingRow("a", name: "Alpha")]),
    try modelPart(),
  ], rows: 1, corrupt: "base-gallery-1.zlib")
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.partMismatch("base-gallery-1.zlib")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

@Test(
  "installing refuses a part that is not zlib, is truncated, or inflates to another size than the manifest",
  arguments: MalformedPart.allCases
)
private func installingRefusesAMalformedPart(_ kind: MalformedPart) throws {
  let version = try writeVersion([
    galleryPart("base-gallery-1.zlib", addOn: 0, firstRow: 0, seeds: [0]),
    try printingListPart("base-printing-list-1.zlib", addOn: 0, firstRow: 0, rows: [printingRow("a", name: "Alpha")]),
    try modelPart(),
  ], rows: 1, malformed: ("base-printing-list-1.zlib", kind))
  let destination = version.appendingPathComponent("installed", isDirectory: true)

  #expect(throws: GalleryInstaller.Failure.malformedPart("base-printing-list-1.zlib")) {
    try GalleryInstaller.install(from: version, into: destination)
  }
  #expect(!FileManager.default.fileExists(atPath: destination.path))
}

private func baseParts() throws -> [PartFile] {
  [
    galleryPart("base-gallery-1.zlib", addOn: 0, firstRow: 0, seeds: [0, 1]),
    galleryPart("base-gallery-2.zlib", addOn: 0, firstRow: 2, seeds: [2]),
    try printingListPart("base-printing-list-1.zlib", addOn: 0, firstRow: 0, rows: [
      printingRow("a", name: "Alpha"), printingRow("b", name: "Beta"), printingRow("c", name: "Gamma"),
    ]),
    try modelPart(),
  ]
}

private func addOnParts() throws -> [PartFile] {
  [
    galleryPart("add-on-1-gallery-1.zlib", addOn: 1, firstRow: 3, seeds: [7, 8]),
    try printingListPart("add-on-1-printing-list-1.zlib", addOn: 1, firstRow: 3, rows: [
      printingRow("b", name: "Beta, new image"), printingRow("d", name: "Delta"),
    ]),
  ]
}

private let addOnPartNames: Set<String> = ["add-on-1-gallery-1.zlib", "add-on-1-printing-list-1.zlib"]

private func installedBase() throws -> URL {
  let base = try writeVersion(try baseParts(), rows: 3, version: "20261021-aaaaaa")
  let destination = base.appendingPathComponent("installed", isDirectory: true)
  try GalleryInstaller.install(from: base, into: destination)
  return destination
}

private func vectorsAndPrintingList(in directory: URL) throws -> (Data, [String]) {
  let gallery = try Gallery(directory: directory)
  return (try Data(contentsOf: directory.appendingPathComponent(GalleryFile.float16Vectors)), gallery.printings.map(\.name))
}

@Test("an update downloads only the parts that the installed gallery does not have")
func anUpdateDownloadsOnlyThePartsThatTheInstalledGalleryDoesNotHave() throws {
  let destination = try installedBase()
  let update = try writeVersion(try baseParts() + addOnParts(), rows: 4, version: "20261028-bbbbbb")

  let parts = GalleryInstaller.partsToDownload(try GalleryInstaller.manifest(in: update), over: destination)

  #expect(Set(parts.map(\.name)) == addOnPartNames)
}

@Test("a new base downloads every part")
func aNewBaseDownloadsEveryPart() throws {
  let destination = try installedBase()
  let newBase = try writeVersion([
    galleryPart("base-gallery-1.zlib", addOn: 0, firstRow: 0, seeds: [4]),
    try printingListPart("base-printing-list-1.zlib", addOn: 0, firstRow: 0, rows: [printingRow("a", name: "Alpha")]),
    try modelPart(),
  ], rows: 1, version: "20261104-cccccc")

  let parts = GalleryInstaller.partsToDownload(try GalleryInstaller.manifest(in: newBase), over: destination)

  #expect(parts.map(\.name) == ["base-gallery-1.zlib", "base-printing-list-1.zlib", "base-model.zlib"])
}

@Test("an update installs the downloaded add-on over the installed gallery")
func anUpdateInstallsTheDownloadedAddOnOverTheInstalledGallery() throws {
  let destination = try installedBase()
  let update = try writeVersion(
    try baseParts() + addOnParts(), rows: 4, version: "20261028-bbbbbb", downloaded: addOnPartNames
  )
  let fullInstall = update.appendingPathComponent("full", isDirectory: true)
  try GalleryInstaller.install(
    from: try writeVersion(try baseParts() + addOnParts(), rows: 4, version: "20261028-bbbbbb"),
    into: fullInstall
  )

  try GalleryInstaller.install(from: update, into: destination)

  let (vectors, names) = try vectorsAndPrintingList(in: destination)
  let (expectedVectors, expectedNames) = try vectorsAndPrintingList(in: fullInstall)
  #expect(names == ["Alpha", "Beta, new image", "Gamma", "Delta"])
  #expect(names == expectedNames)
  #expect(vectors == expectedVectors)
  #expect(try GalleryInstaller.manifest(in: destination).version == "20261028-bbbbbb")
  #expect(try Gallery(directory: destination).compiledModel.featurePrint(of: card(seed: 1)).count == fixtureModel.vectorSize)
}

@Test("a failed update leaves the installed gallery in use")
func aFailedUpdateLeavesTheInstalledGalleryInUse() throws {
  let destination = try installedBase()
  let update = try writeVersion(
    try baseParts() + addOnParts(),
    rows: 4,
    version: "20261028-bbbbbb",
    corrupt: "add-on-1-gallery-1.zlib",
    downloaded: addOnPartNames
  )

  #expect(throws: GalleryInstaller.Failure.partMismatch("add-on-1-gallery-1.zlib")) {
    try GalleryInstaller.install(from: update, into: destination)
  }
  let gallery = try Gallery(directory: destination)
  #expect(gallery.printings.map(\.name) == ["Alpha", "Beta", "Gamma"])
  #expect(try GalleryInstaller.manifest(in: destination).version == "20261021-aaaaaa")
  let leftovers = try FileManager.default.contentsOfDirectory(atPath: destination.deletingLastPathComponent().path)
  #expect(leftovers.allSatisfy { !$0.hasPrefix(".installed-") })
}
