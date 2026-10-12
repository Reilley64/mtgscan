import Compression
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

  public static func manifest(in directory: URL) throws -> GalleryManifest {
    let manifest = try JSONDecoder().decode(
      GalleryManifest.self,
      from: Data(contentsOf: directory.appendingPathComponent(manifestFile))
    )
    guard manifest.formatVersion == GalleryManifest.formatVersion else {
      throw Failure.unsupportedManifest("format version \(manifest.formatVersion)")
    }
    return manifest
  }

  public static func verifiedPart(_ part: GalleryManifest.Part, in directory: URL) throws -> Data {
    let compressed = try Data(contentsOf: directory.appendingPathComponent(part.name))
    let digest = SHA256.hash(data: compressed).map { String(format: "%02x", $0) }.joined()
    guard compressed.count == part.compressedBytes, digest == part.sha256 else {
      throw Failure.partMismatch(part.name)
    }
    return try inflated(compressed, rawBytes: part.rawBytes, name: part.name)
  }

  public static func install(from directory: URL, into destination: URL) throws {
    let manifest = try manifest(in: directory)
    let ordered = manifest.parts.sorted { ($0.addOn, $0.firstRow) < ($1.addOn, $1.firstRow) }
    var rows: [[String: Any]] = []
    var slots: [Int] = []
    var slotById: [String: Int] = [:]
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
      FileManager.default.createFile(atPath: vectorsURL.path, contents: nil)
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

  static func inflated(_ compressed: Data, rawBytes: Int, name: String) throws -> Data {
    let headerBytes = 2
    let trailerBytes = 4
    guard compressed.count > headerBytes + trailerBytes, compressed[compressed.startIndex] & 0x0F == 8 else {
      throw Failure.malformedPart(name)
    }
    var output = Data(count: rawBytes + 1)
    let written = output.withUnsafeMutableBytes { target in
      compressed.withUnsafeBytes { source in
        compression_decode_buffer(
          target.bindMemory(to: UInt8.self).baseAddress!, rawBytes + 1,
          source.bindMemory(to: UInt8.self).baseAddress! + headerBytes, compressed.count - headerBytes - trailerBytes,
          nil, COMPRESSION_ZLIB
        )
      }
    }
    guard written == rawBytes else { throw Failure.malformedPart(name) }
    return output.prefix(rawBytes)
  }
}
