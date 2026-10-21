import Foundation

public struct GalleryParity: Codable, Sendable {
  public static let referenceCount = 24

  public let version: String?
  public let references: Int
  public let lowestCosine: Double
  public let meanCosine: Double
  public let failures: [String]

  public enum Failure: Error {
    case noImageURL
    case imageDownload(Int)
  }

  static func referenceRows(rowCount: Int) -> [Int] {
    let count = min(referenceCount, rowCount)
    return (0 ..< count).map { $0 * rowCount / count }
  }

  static func imageURL(printingId: String) -> URL? {
    let id = printingId.lowercased()
    guard let first = id.first, let second = id.dropFirst().first else { return nil }
    return URL(string: "https://cards.scryfall.io/normal/front/\(first)/\(second)/\(id).jpg")
  }

  public static func scryfallImage(of printing: GalleryPrinting) async throws -> Data {
    guard let url = imageURL(printingId: printing.id) else { throw Failure.noImageURL }
    let (data, response) = try await URLSession.shared.data(from: url)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw Failure.imageDownload(status) }
    return data
  }

  public static func check(
    gallery: Gallery,
    referenceImage: (GalleryPrinting) async throws -> Data
  ) async -> GalleryParity {
    var cosines: [Double] = []
    var failures: [String] = []
    for row in referenceRows(rowCount: gallery.printings.count) {
      let printing = gallery.printings[row]
      do {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("parity-\(UUID().uuidString)")
        try await referenceImage(printing).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let phone = try gallery.compiledModel.featurePrint(ofCardAt: file)
        cosines.append(Double(zip(phone, gallery.vector(at: row)).reduce(0) { $0 + $1.0 * $1.1 }))
      } catch {
        failures.append("\(printing.id): \(error)")
      }
    }
    return GalleryParity(
      version: gallery.version,
      references: cosines.count,
      lowestCosine: cosines.min() ?? 0,
      meanCosine: cosines.isEmpty ? 0 : cosines.reduce(0, +) / Double(cosines.count),
      failures: failures
    )
  }
}
