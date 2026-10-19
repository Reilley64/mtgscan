import Foundation

public enum RecognitionFailure: Error, Equatable {
  case galleryNotReady
  case unreadablePhoto
  case rectificationFailed

  public var code: String {
    switch self {
    case .galleryNotReady: "gallery_not_ready"
    case .unreadablePhoto: "unreadable_photo"
    case .rectificationFailed: "rectification_failed"
    }
  }
}

public struct RecognitionCandidate: Codable, Sendable, Equatable {
  public let printingId: String
  public let oracleId: String
  public let name: String
  public let setCode: String
  public let collectorNumber: String
  public let finishes: [String]
  public let basicLand: Bool

  public init(printing: GalleryPrinting) {
    printingId = printing.id
    oracleId = printing.oracleId
    name = printing.name
    setCode = printing.set
    collectorNumber = printing.collectorNumber
    finishes = printing.finishes
    basicLand = printing.basicLand
  }
}

public enum DecisionBasis: String, Codable, Sendable {
  case collectorLine = "collector_line"
  case setCode = "set_code"
  case uniqueArt = "unique_art"
}

public struct RecognitionDecision: Codable, Sendable, Equatable {
  public let accepted: Bool
  public let basis: DecisionBasis?
  public let reasons: [String]

  init(basis: DecisionBasis?, reasons: [String]) {
    accepted = basis != nil
    self.basis = basis
    self.reasons = reasons
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accepted, forKey: .accepted)
    try container.encode(basis, forKey: .basis)
    try container.encode(reasons, forKey: .reasons)
  }
}

public struct CollectorLineReading: Codable, Sendable, Equatable {
  public let setCode: String?
  public let collectorNumber: String?
  public let premiumMark: Bool
}

public struct CardRecognition: Codable, Sendable, Equatable {
  public let candidates: [RecognitionCandidate]
  public let decision: RecognitionDecision
  public let reading: CollectorLineReading
  public let sameTextTwinCount: Int
  public let topSimilarity: Double
  public let artMargin: Double?
  public let rotation: Int
  public let trainingCrop: String?
  public let stageMs: [String: Double]

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(candidates, forKey: .candidates)
    try container.encode(decision, forKey: .decision)
    try container.encode(reading, forKey: .reading)
    try container.encode(sameTextTwinCount, forKey: .sameTextTwinCount)
    try container.encode(topSimilarity, forKey: .topSimilarity)
    try container.encode(artMargin, forKey: .artMargin)
    try container.encode(rotation, forKey: .rotation)
    try container.encode(trainingCrop, forKey: .trainingCrop)
    try container.encode(stageMs, forKey: .stageMs)
  }
}

public struct NotACardRecognition: Codable, Sendable, Equatable {
  public let topSimilarity: Double
  public let stageMs: [String: Double]
}

public enum Recognition: Sendable, Equatable, Encodable {
  case card(CardRecognition)
  case notACard(NotACardRecognition)

  private enum Kind: String, Encodable {
    case card
    case notACard = "not_a_card"
  }

  private enum CodingKeys: String, CodingKey {
    case kind
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case let .card(card):
      try container.encode(Kind.card, forKey: .kind)
      try card.encode(to: encoder)
    case let .notACard(notACard):
      try container.encode(Kind.notACard, forKey: .kind)
      try notACard.encode(to: encoder)
    }
  }
}
