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
  public let similarity: Double
}

public struct RecognitionDecision: Codable, Sendable, Equatable {
  public let accepted: Bool
  public let reasons: [String]
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
  public let rotation: Int
  public let stageMs: [String: Double]

  public var acceptedPrintingId: String? {
    decision.accepted ? candidates.first?.printingId : nil
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
