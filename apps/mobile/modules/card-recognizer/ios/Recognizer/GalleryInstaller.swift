import CryptoKit
import Foundation

public struct GalleryManifest: Codable, Sendable {
  public static let formatVersion = 1

  public struct Part: Codable, Sendable {
    public static let gallery = "gallery"
    public static let printingList = "printing_list"

    public let name: String
    public let kind: String
    public let addOn: Int
    public let firstRow: Int
    public let rowCount: Int
    public let compressedBytes: Int
    public let rawBytes: Int
    public let sha256: String

    var key: String { "\(name)|\(sha256)" }
  }

  public let formatVersion: Int
  public let version: String
  public let builtAt: String
  public let rows: Int
  public let parts: [Part]
}

public enum GalleryInstaller {
  public static let manifestFile = "manifest.json"

  public enum Failure: Error, Equatable {
    case unsupportedManifest(String)
    case partMismatch(String)
    case malformedPart(String)
  }

  public static func manifest(from data: Data) throws -> GalleryManifest {
    let manifest = try JSONDecoder().decode(GalleryManifest.self, from: data)
    guard manifest.formatVersion == GalleryManifest.formatVersion else {
      throw Failure.unsupportedManifest("format version \(manifest.formatVersion)")
    }
    return manifest
  }

  public static func manifest(in directory: URL) throws -> GalleryManifest {
    try manifest(from: Data(contentsOf: directory.appendingPathComponent(manifestFile)))
  }

  public static func partMatches(_ part: GalleryManifest.Part, file: URL) -> Bool {
    guard let compressed = try? Data(contentsOf: file, options: .alwaysMapped) else { return false }
    return compressed.count == part.compressedBytes && sha256(of: compressed) == part.sha256
  }

  public static func verifiedPart(_ part: GalleryManifest.Part, in directory: URL) throws -> Data {
    let compressed = try Data(contentsOf: directory.appendingPathComponent(part.name))
    guard compressed.count == part.compressedBytes, sha256(of: compressed) == part.sha256 else {
      throw Failure.partMismatch(part.name)
    }
    return try inflated(compressed, rawBytes: part.rawBytes, name: part.name)
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
    let dimension = FeaturePrint.dimension
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
      try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys, .withoutEscapingSlashes])
        .write(to: staging.appendingPathComponent(GalleryFile.printingList))
      let header = GalleryHeader(
        count: rows.count,
        dimension: dimension,
        revision: FeaturePrint.revision,
        createdAt: manifest.builtAt,
        encoding: GalleryHeader.float16,
        version: manifest.version
      )
      try JSONEncoder().encode(header).write(to: staging.appendingPathComponent(GalleryFile.header))
      try FileManager.default.copyItem(
        at: directory.appendingPathComponent(manifestFile),
        to: staging.appendingPathComponent(manifestFile)
      )
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

  static func installedParts(for manifest: GalleryManifest, in destination: URL) -> GalleryManifest? {
    guard let installed = try? Self.manifest(in: destination),
          let header = try? JSONDecoder().decode(
            GalleryHeader.self,
            from: Data(contentsOf: destination.appendingPathComponent(GalleryFile.header))
          ),
          header.version == installed.version, header.count == installed.rows
    else { return nil }
    let wanted = Set(manifest.parts.map(\.key))
    let installedKeys = Set(installed.parts.map(\.key))
    let lastInstalledAddOn = installed.parts.map(\.addOn).max() ?? -1
    let comesAfterInstalled = manifest.parts.allSatisfy { installedKeys.contains($0.key) || $0.addOn > lastInstalledAddOn }
    return installedKeys.isSubset(of: wanted) && comesAfterInstalled ? installed : nil
  }

  static func installedRows(in destination: URL) throws -> [[String: Any]] {
    let decoded = try JSONSerialization.jsonObject(with: Data(contentsOf: destination.appendingPathComponent(GalleryFile.printingList)))
    guard let rows = decoded as? [[String: Any]] else { throw Failure.malformedPart(GalleryFile.printingList) }
    return rows
  }

  static func sha256(of data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  static func inflated(_ compressed: Data, rawBytes: Int, name: String) throws -> Data {
    guard compressed.count > 6, compressed[compressed.startIndex] & 0x0F == 8,
          let raw = try? (compressed.dropFirst(2).dropLast(4) as NSData).decompressed(using: .zlib) as Data,
          raw.count == rawBytes
    else { throw Failure.malformedPart(name) }
    return raw
  }
}
