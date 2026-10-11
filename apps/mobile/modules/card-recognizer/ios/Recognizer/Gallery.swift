import Accelerate
import Foundation

public struct GalleryPrinting: Codable, Sendable {
  public let id: String
  public let oracleId: String
  public let illustrationId: String?
  public let name: String
  public let set: String
  public let collectorNumber: String
  public let frame: String
}

public struct GalleryHeader: Codable, Sendable {
  public let count: Int
  public let dimension: Int
  public let revision: Int
  public let createdAt: String
  public let encoding: String?

  public init(count: Int, dimension: Int, revision: Int, createdAt: String, encoding: String?) {
    self.count = count
    self.dimension = dimension
    self.revision = revision
    self.createdAt = createdAt
    self.encoding = encoding
  }
}

public enum GalleryFile {
  public static let printingList = "catalog.json"
  public static let header = "gallery.json"
  public static let float16Vectors = "gallery.f16"
  public static let int8Vectors = "gallery.i8"
}

public final class Gallery: Sendable {
  public static let searchChunkRows = 4096

  public let printings: [GalleryPrinting]
  public let dimension: Int
  public let printingsByIllustration: [String: [Int]]
  public let setCodes: Set<String>
  private let halves: Data
  private let indexBySetAndNumber: [String: Int]
  private let indexById: [String: Int]

  public enum Failure: Error {
    case mismatch(String)
  }

  public init(directory: URL) throws {
    let decoder = JSONDecoder()
    printings = try decoder.decode(
      [GalleryPrinting].self,
      from: Data(contentsOf: directory.appendingPathComponent(GalleryFile.printingList))
    )
    let header = try decoder.decode(
      GalleryHeader.self,
      from: Data(contentsOf: directory.appendingPathComponent(GalleryFile.header))
    )
    guard header.count == printings.count, header.dimension == FeaturePrint.dimension else {
      throw Failure.mismatch("gallery has \(header.count)x\(header.dimension), printing list has \(printings.count)")
    }
    dimension = header.dimension
    switch header.encoding ?? "float16" {
    case "float16":
      let raw = try Data(contentsOf: directory.appendingPathComponent(GalleryFile.float16Vectors), options: .alwaysMapped)
      guard raw.count == header.count * header.dimension * MemoryLayout<Float16>.size else {
        throw Failure.mismatch("\(GalleryFile.float16Vectors) has \(raw.count) bytes")
      }
      halves = raw
    case "int8":
      halves = try Self.unitHalves(
        fromInt8: Data(contentsOf: directory.appendingPathComponent(GalleryFile.int8Vectors), options: .alwaysMapped),
        count: header.count,
        dimension: header.dimension
      )
    case let encoding:
      throw Failure.mismatch("unknown gallery encoding \(encoding)")
    }
    var bySetAndNumber: [String: Int] = [:]
    var byIllustration: [String: [Int]] = [:]
    for (index, printing) in printings.enumerated() {
      bySetAndNumber[Self.key(set: printing.set, collectorNumber: printing.collectorNumber)] = index
      if let illustration = printing.illustrationId {
        byIllustration[illustration, default: []].append(index)
      }
    }
    indexBySetAndNumber = bySetAndNumber
    indexById = Dictionary(uniqueKeysWithValues: printings.enumerated().map { ($1.id, $0) })
    printingsByIllustration = byIllustration
    setCodes = Set(printings.map { $0.set })
  }

  static func unitHalves(fromInt8 codes: Data, count: Int, dimension: Int) throws -> Data {
    guard codes.count == count * dimension else {
      throw Failure.mismatch("\(GalleryFile.int8Vectors) has \(codes.count) bytes")
    }
    var halves = Data(count: count * dimension * MemoryLayout<Float16>.size)
    var row = [Float](repeating: 0, count: dimension)
    codes.withUnsafeBytes { source in
      halves.withUnsafeMutableBytes { target in
        let values = source.bindMemory(to: Int8.self)
        let output = target.bindMemory(to: Float16.self)
        for index in 0 ..< count {
          vDSP_vflt8(values.baseAddress! + index * dimension, 1, &row, 1, vDSP_Length(dimension))
          var squares: Float = 0
          vDSP_svesq(row, 1, &squares, vDSP_Length(dimension))
          var scale = squares > 0 ? 1 / squares.squareRoot() : 0
          vDSP_vsmul(row, 1, &scale, &row, 1, vDSP_Length(dimension))
          row.withUnsafeMutableBytes { rowBytes in
            var source = vImage_Buffer(
              data: rowBytes.baseAddress, height: 1, width: vImagePixelCount(dimension),
              rowBytes: dimension * MemoryLayout<Float>.size
            )
            var destination = vImage_Buffer(
              data: output.baseAddress! + index * dimension, height: 1, width: vImagePixelCount(dimension),
              rowBytes: dimension * MemoryLayout<Float16>.size
            )
            vImageConvert_PlanarFtoPlanar16F(&source, &destination, vImage_Flags(kvImageNoFlags))
          }
        }
      }
    }
    return halves
  }

  public static func key(set: String, collectorNumber: String) -> String {
    let trimmed = collectorNumber.drop { $0 == "0" }
    return "\(set.lowercased())|\(trimmed.isEmpty ? "0" : String(trimmed).lowercased())"
  }

  public func index(set: String, collectorNumber: String) -> Int? {
    indexBySetAndNumber[Self.key(set: set, collectorNumber: collectorNumber)]
  }

  public func index(id: String) -> Int? {
    indexById[id]
  }

  public func vector(at index: Int) -> [Float] {
    halves.withUnsafeBytes { buffer in
      let values = buffer.bindMemory(to: Float16.self)
      return (0 ..< dimension).map { Float(values[index * dimension + $0]) }
    }
  }

  func similarities(to queries: [[Float]]) -> [[Float]] {
    let count = printings.count
    let queryCount = queries.count
    var queryMatrix = [Float](repeating: 0, count: dimension * queryCount)
    for (column, query) in queries.enumerated() {
      for row in 0 ..< dimension { queryMatrix[row * queryCount + column] = query[row] }
    }
    var scores = [[Float]](repeating: [Float](repeating: 0, count: count), count: queryCount)
    var converted = [Float](repeating: 0, count: Self.searchChunkRows * dimension)
    var products = [Float](repeating: 0, count: Self.searchChunkRows * queryCount)
    halves.withUnsafeBytes { buffer in
      guard let base = buffer.baseAddress else { return }
      for start in stride(from: 0, to: count, by: Self.searchChunkRows) {
        let rows = min(Self.searchChunkRows, count - start)
        let values = rows * dimension
        converted.withUnsafeMutableBytes { target in
          var source = vImage_Buffer(
            data: UnsafeMutableRawPointer(mutating: base + start * dimension * MemoryLayout<Float16>.size),
            height: 1, width: vImagePixelCount(values), rowBytes: values * MemoryLayout<Float16>.size
          )
          var destination = vImage_Buffer(
            data: target.baseAddress, height: 1, width: vImagePixelCount(values), rowBytes: values * MemoryLayout<Float>.size
          )
          vImageConvert_Planar16FtoPlanarF(&source, &destination, vImage_Flags(kvImageNoFlags))
        }
        vDSP_mmul(
          converted, 1, queryMatrix, 1, &products, 1,
          vDSP_Length(rows), vDSP_Length(queryCount), vDSP_Length(dimension)
        )
        for row in 0 ..< rows {
          for column in 0 ..< queryCount {
            scores[column][start + row] = products[row * queryCount + column]
          }
        }
      }
    }
    return scores
  }

  func top(_ count: Int, of scores: [Float]) -> [Int] {
    var best: [(Int, Float)] = []
    best.reserveCapacity(count + 1)
    for (index, score) in scores.enumerated() {
      if best.count < count {
        best.append((index, score))
        if best.count == count { best.sort { $0.1 > $1.1 } }
      } else if score > best[count - 1].1 {
        var position = count - 1
        while position > 0 && best[position - 1].1 < score { position -= 1 }
        best.insert((index, score), at: position)
        best.removeLast()
      }
    }
    if best.count < count { best.sort { $0.1 > $1.1 } }
    return best.map { $0.0 }
  }
}
