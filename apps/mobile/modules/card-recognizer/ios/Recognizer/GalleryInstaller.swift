import CoreML
import CryptoKit
import Foundation

public enum GalleryInstaller {
  public static let manifestFile = "manifest.json"

  public enum Failure: Error, Equatable {
    case unsupportedManifest(String)
    case partMismatch(String)
    case malformedPart(String)
  }

  private struct FormatVersion: Decodable {
    let formatVersion: Int
  }

  public static func manifest(from data: Data) throws -> GalleryManifest {
    let format = try JSONDecoder().decode(FormatVersion.self, from: data).formatVersion
    guard format == GalleryManifest.formatVersion else {
      throw Failure.unsupportedManifest("format version \(format)")
    }
    let manifest = try JSONDecoder().decode(GalleryManifest.self, from: data)
    if let encoding = manifest.encoding, encoding.type != "int8" || encoding.scale != "per_vector" {
      throw Failure.unsupportedManifest("the gallery encoding is unsupported")
    }
    guard manifest.parts.contains(where: { $0.kind == GalleryManifest.Part.model }) else {
      throw Failure.unsupportedManifest("the gallery version has no model part")
    }
    guard safeName(manifest.version), manifest.rows > 0, manifest.rows <= Int32.max,
          manifest.model.vectorSize > 0, manifest.model.vectorSize <= Int32.max,
          manifest.model.inputSize.width > 0, manifest.model.inputSize.height > 0,
          validHash(manifest.model.sha256),
          [manifest.thresholds.notACard, manifest.thresholds.orientationMargin, manifest.thresholds.artMargin].allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 2 }),
          Set(manifest.parts.map(\.name)).count == manifest.parts.count,
          manifest.parts.filter({ $0.kind == GalleryManifest.Part.model }).count == 1,
          manifest.parts.allSatisfy({ part in
            safeName(part.name) && validHash(part.sha256)
              && [GalleryManifest.Part.gallery, GalleryManifest.Part.printingList, GalleryManifest.Part.model].contains(part.kind)
              && part.addOn >= 0 && part.firstRow >= 0 && part.rowCount >= 0
              && part.compressedBytes > 0 && part.compressedBytes <= Int32.max
              && part.rawBytes > 0 && part.rawBytes <= Int32.max
              && (part.kind != GalleryManifest.Part.model || (part.addOn == 0 && part.firstRow == 0 && part.rowCount == 0))
          })
    else { throw Failure.malformedPart(manifestFile) }
    return manifest
  }

  private static func safeName(_ value: String) -> Bool {
    !value.isEmpty && value != "." && value != ".."
      && value.utf8.allSatisfy { (45...57).contains($0) && $0 != 47 || (65...90).contains($0) || $0 == 95 || (97...122).contains($0) }
  }

  private static func validHash(_ value: String) -> Bool {
    value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }

  public static func manifest(in directory: URL) throws -> GalleryManifest {
    try manifest(from: Data(contentsOf: directory.appendingPathComponent(manifestFile)))
  }

  public static func partMatches(_ part: GalleryManifest.Part, file: URL) -> Bool {
    guard let compressed = try? Data(contentsOf: file, options: .alwaysMapped) else { return false }
    return partMatches(part, data: compressed)
  }

  public static func partMatches(_ part: GalleryManifest.Part, data: Data) -> Bool {
    data.count == part.compressedBytes && sha256(of: data) == part.sha256
  }

  public static func verifiedPart(_ part: GalleryManifest.Part, in directory: URL) throws -> Data {
    let compressed = try Data(contentsOf: directory.appendingPathComponent(part.name))
    guard partMatches(part, data: compressed) else {
      throw Failure.partMismatch(part.name)
    }
    return try inflated(compressed, rawBytes: part.rawBytes, name: part.name)
  }

  public static func canReuse(_ installed: GalleryManifest, for manifest: GalleryManifest) -> Bool {
    guard installed.model == manifest.model, installed.thresholds == manifest.thresholds else { return false }
    let wanted = Set(manifest.parts.map(\.key))
    let installedKeys = Set(installed.parts.map(\.key))
    let lastInstalledAddOn = installed.parts.map(\.addOn).max() ?? -1
    return installedKeys.isSubset(of: wanted)
      && manifest.parts.allSatisfy { installedKeys.contains($0.key) || $0.addOn > lastInstalledAddOn }
  }

  public static func partsToDownload(_ manifest: GalleryManifest, installed: GalleryManifest?) -> [GalleryManifest.Part] {
    guard let installed, canReuse(installed, for: manifest) else { return manifest.parts }
    let existing = Set(installed.parts.map(\.key))
    return manifest.parts.filter { !existing.contains($0.key) }
  }

  public static func partsToDownload(_ manifest: GalleryManifest, over destination: URL) -> [GalleryManifest.Part] {
    let installed = Set(installedParts(for: manifest, in: destination)?.parts.map(\.key) ?? [])
    return manifest.parts.filter { !installed.contains($0.key) }
  }

  public static func install(from directory: URL, into destination: URL) throws {
    let manifest = try manifest(in: directory)
    let installed = installedParts(for: manifest, in: destination)
    let installedKeys = Set(installed?.parts.map(\.key) ?? [])
    let ordered = manifest.parts
      .filter { !installedKeys.contains($0.key) }
      .sorted { ($0.addOn, $0.firstRow) < ($1.addOn, $1.firstRow) }
    var rows = installed == nil ? [] : try installedRows(in: destination)
    var slotById = Dictionary(rows.enumerated().compactMap { slot, row in (row["id"] as? String).map { ($0, slot) } }) { first, _ in first }
    var slots: [Int] = []
    for part in ordered where part.kind == GalleryManifest.Part.printingList {
      let decoded = try JSONSerialization.jsonObject(with: verifiedPart(part, in: directory))
      guard let partRows = decoded as? [[String: Any]], partRows.count == part.rowCount else {
        throw Failure.malformedPart(part.name)
      }
      for row in partRows {
        guard let id = row["id"] as? String else { throw Failure.malformedPart(part.name) }
        if let slot = slotById[id] {
          rows[slot] = row
          slots.append(slot)
        } else {
          slotById[id] = rows.count
          slots.append(rows.count)
          rows.append(row)
        }
      }
    }
    guard rows.count == manifest.rows else {
      throw Failure.unsupportedManifest("the manifest has \(manifest.rows) rows, the printing lists have \(rows.count)")
    }
    let dimension = manifest.model.vectorSize
    let staging = destination.deletingLastPathComponent()
      .appendingPathComponent(".\(destination.lastPathComponent)-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    do {
      let vectorsURL = staging.appendingPathComponent(GalleryFile.float16Vectors)
      if installed == nil {
        FileManager.default.createFile(atPath: vectorsURL.path, contents: nil)
      } else {
        try FileManager.default.copyItem(at: destination.appendingPathComponent(GalleryFile.float16Vectors), to: vectorsURL)
      }
      let vectors = try FileHandle(forWritingTo: vectorsURL)
      try vectors.truncate(atOffset: UInt64(rows.count * dimension * MemoryLayout<Float16>.size))
      var streamRow = 0
      for part in ordered where part.kind == GalleryManifest.Part.gallery {
        let codes = try verifiedPart(part, in: directory)
        guard codes.count == part.rowCount * dimension, streamRow + part.rowCount <= slots.count else {
          throw Failure.malformedPart(part.name)
        }
        try codes.withUnsafeBytes { buffer in
          let values = buffer.bindMemory(to: Int8.self)
          for row in 0 ..< part.rowCount {
            let vector = GalleryEncoding.unitVector(
              of: UnsafeBufferPointer(rebasing: values[(row * dimension) ..< ((row + 1) * dimension)])
            )
            try vectors.seek(toOffset: UInt64(slots[streamRow + row] * dimension * MemoryLayout<Float16>.size))
            try vectors.write(contentsOf: vector.withUnsafeBufferPointer { Data(buffer: $0) })
          }
        }
        streamRow += part.rowCount
      }
      try vectors.close()
      guard streamRow == slots.count else {
        throw Failure.unsupportedManifest("the gallery parts have \(streamRow) rows, the printing lists have \(slots.count)")
      }
      if let part = ordered.first(where: { $0.kind == GalleryManifest.Part.model }) {
        try installModel(part, of: manifest, from: directory, into: staging)
      } else if installed != nil {
        try FileManager.default.copyItem(
          at: destination.appendingPathComponent(GalleryFile.compiledModel),
          to: staging.appendingPathComponent(GalleryFile.compiledModel)
        )
      } else {
        throw Failure.unsupportedManifest("the gallery version has no model part")
      }
      try validateModel(in: staging, model: manifest.model)
      try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys, .withoutEscapingSlashes])
        .write(to: staging.appendingPathComponent(GalleryFile.printingList))
      let header = GalleryHeader(
        count: rows.count,
        model: manifest.model,
        thresholds: manifest.thresholds,
        createdAt: manifest.builtAt,
        encoding: GalleryHeader.float16,
        version: manifest.version
      )
      try JSONEncoder().encode(header).write(to: staging.appendingPathComponent(GalleryFile.header))
      try FileManager.default.copyItem(
        at: directory.appendingPathComponent(manifestFile),
        to: staging.appendingPathComponent(manifestFile)
      )
      var backupExcluded = staging
      var resources = URLResourceValues()
      resources.isExcludedFromBackup = true
      try backupExcluded.setResourceValues(resources)
      if FileManager.default.fileExists(atPath: destination.path) {
        _ = try FileManager.default.replaceItemAt(destination, withItemAt: staging)
      } else {
        try FileManager.default.moveItem(at: staging, to: destination)
      }
    } catch {
      try? FileManager.default.removeItem(at: staging)
      throw error
    }
  }

  public static func modelShapeMatches(input: [Int], output: [Int], model: FeaturePrintModel) -> Bool {
    input == [1, 3, model.inputSize.height, model.inputSize.width]
      && !output.isEmpty && output.allSatisfy({ $0 > 0 })
      && output.reduce(1, { $0.multipliedReportingOverflow(by: $1).overflow ? 0 : $0 * $1 }) == model.vectorSize
  }

  public static func validateModel(in directory: URL, model: FeaturePrintModel) throws {
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    let loaded = try MLModel(contentsOf: directory.appendingPathComponent(GalleryFile.compiledModel), configuration: configuration)
    guard let input = loaded.modelDescription.inputDescriptionsByName[FeaturePrintModel.inputName]?.multiArrayConstraint,
          let output = loaded.modelDescription.outputDescriptionsByName[FeaturePrintModel.outputName]?.multiArrayConstraint,
          output.dataType == .float16,
          modelShapeMatches(input: input.shape.map(\.intValue), output: output.shape.map(\.intValue), model: model)
    else { throw Failure.unsupportedManifest("the compiled model does not match the gallery") }
  }

  static func installModel(_ part: GalleryManifest.Part, of manifest: GalleryManifest, from directory: URL, into staging: URL) throws {
    let package = staging.appendingPathComponent(GalleryFile.modelPackage)
    do {
      try ModelPackage.unpack(verifiedPart(part, in: directory), into: staging)
    } catch ModelPackage.Failure.malformedArchive {
      throw Failure.malformedPart(part.name)
    }
    guard (try? ModelPackage.sha256(of: package)) == manifest.model.sha256 else { throw Failure.partMismatch(part.name) }
    let compiled = try MLModel.compileModel(at: package)
    try FileManager.default.moveItem(at: compiled, to: staging.appendingPathComponent(GalleryFile.compiledModel))
    try FileManager.default.removeItem(at: package)
  }

  public static func validatedInstalledManifest(in directory: URL) throws -> GalleryManifest {
    let manifest = try Self.manifest(in: directory)
    let header = try JSONDecoder().decode(GalleryHeader.self, from: Data(contentsOf: directory.appendingPathComponent(GalleryFile.header)))
    let vectors = try directory.appendingPathComponent(GalleryFile.float16Vectors).resourceValues(forKeys: [.fileSizeKey]).fileSize
    guard header.version == manifest.version, header.count == manifest.rows,
          header.model == manifest.model, header.thresholds == manifest.thresholds,
          header.encoding == GalleryHeader.float16,
          try installedRows(in: directory).count == manifest.rows,
          vectors == manifest.rows * manifest.model.vectorSize * MemoryLayout<Float16>.size
    else { throw Failure.malformedPart(manifestFile) }
    try validateModel(in: directory, model: manifest.model)
    return manifest
  }

  static func installedParts(for manifest: GalleryManifest, in destination: URL) -> GalleryManifest? {
    guard let installed = try? validatedInstalledManifest(in: destination), canReuse(installed, for: manifest)
    else { return nil }
    return installed
  }

  static func installedRows(in destination: URL) throws -> [[String: Any]] {
    let decoded = try JSONSerialization.jsonObject(with: Data(contentsOf: destination.appendingPathComponent(GalleryFile.printingList)))
    guard let rows = decoded as? [[String: Any]] else { throw Failure.malformedPart(GalleryFile.printingList) }
    return rows
  }

  static func sha256(of data: Data) -> String {
    SHA256.hash(data: data).hex
  }

  static func inflated(_ compressed: Data, rawBytes: Int, name: String) throws -> Data {
    guard compressed.count > 6, compressed[compressed.startIndex] & 0x0F == 8,
          let raw = try? (compressed.dropFirst(2).dropLast(4) as NSData).decompressed(using: .zlib) as Data,
          raw.count == rawBytes
    else { throw Failure.malformedPart(name) }
    return raw
  }
}
