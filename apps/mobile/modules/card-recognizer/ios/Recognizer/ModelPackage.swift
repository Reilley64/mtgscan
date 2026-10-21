import CryptoKit
import Foundation

public enum ModelPackage {
  public enum Failure: Error, Equatable {
    case malformedArchive
  }

  static let blockSize = 512

  public static func sha256(of package: URL) throws -> String {
    let fileManager = FileManager.default
    let files = try (fileManager.subpathsOfDirectory(atPath: package.path)).filter { path in
      (try fileManager.attributesOfItem(atPath: package.appendingPathComponent(path).path)[.type] as? FileAttributeType) == .typeRegular
    }
    let listing = try files.sorted { Array($0.utf8).lexicographicallyPrecedes(Array($1.utf8)) }.map { path in
      "\(SHA256.hash(data: try Data(contentsOf: package.appendingPathComponent(path))).hex)  \(path)\n"
    }.joined()
    return SHA256.hash(data: Data(listing.utf8)).hex
  }

  public static func unpack(_ archive: Data, into directory: URL) throws {
    let bytes = [UInt8](archive)
    var offset = 0
    while offset + blockSize <= bytes.count {
      let header = bytes[offset ..< offset + blockSize]
      if header.allSatisfy({ $0 == 0 }) { return }
      func field(_ start: Int, _ length: Int) -> String {
        String(decoding: header.dropFirst(start).prefix(length).prefix { $0 != 0 }, as: UTF8.self)
      }
      let name = field(0, 100)
      let prefix = field(345, 155)
      let components = (prefix.isEmpty ? name : "\(prefix)/\(name)").split(separator: "/").map(String.init)
      guard components.first == GalleryFile.modelPackage, !components.contains(".."), !components.contains("."),
            let size = Int(field(124, 12).trimmingCharacters(in: .whitespaces), radix: 8),
            offset + blockSize + size <= bytes.count
      else { throw Failure.malformedArchive }
      let target = components.reduce(directory) { $0.appendingPathComponent($1) }
      let start = offset + blockSize
      switch header[offset + 156] {
      case UInt8(ascii: "5"):
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
      case UInt8(ascii: "0"), 0:
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(bytes[start ..< start + size]).write(to: target)
      default:
        throw Failure.malformedArchive
      }
      offset = start + (size + blockSize - 1) / blockSize * blockSize
    }
    throw Failure.malformedArchive
  }
}
