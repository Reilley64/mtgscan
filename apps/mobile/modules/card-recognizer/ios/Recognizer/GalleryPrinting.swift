import Foundation

public struct GalleryPrinting: Codable, Sendable {
  public let id: String
  public let oracleId: String
  public let illustrationId: String?
  public let name: String
  public let faceNames: [String]
  public let set: String
  public let collectorNumber: String
  public let frame: String
  public let finishes: [String]
  public let basicLand: Bool

  private enum CodingKeys: String, CodingKey {
    case id, oracleId, illustrationId, name, faceNames, set, collectorNumber, frame, finishes, basicLand
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    oracleId = try container.decode(String.self, forKey: .oracleId)
    illustrationId = try container.decodeIfPresent(String.self, forKey: .illustrationId)
    name = try container.decode(String.self, forKey: .name)
    faceNames = try container.decodeIfPresent([String].self, forKey: .faceNames) ?? []
    set = try container.decode(String.self, forKey: .set)
    collectorNumber = try container.decode(String.self, forKey: .collectorNumber)
    frame = try container.decode(String.self, forKey: .frame)
    finishes = try container.decodeIfPresent([String].self, forKey: .finishes) ?? []
    basicLand = try container.decodeIfPresent(Bool.self, forKey: .basicLand) ?? false
  }
}
