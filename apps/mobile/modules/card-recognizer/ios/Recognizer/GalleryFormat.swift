import Foundation

public struct FeaturePrintModel: Codable, Sendable, Equatable {
  public struct InputSize: Codable, Sendable, Equatable {
    public let width: Int
    public let height: Int

    public init(width: Int, height: Int) {
      self.width = width
      self.height = height
    }
  }

  public let name: String
  public let sha256: String
  public let inputSize: InputSize
  public let vectorSize: Int

  public init(name: String, sha256: String, inputSize: InputSize, vectorSize: Int) {
    self.name = name
    self.sha256 = sha256
    self.inputSize = inputSize
    self.vectorSize = vectorSize
  }
}

public struct RecognizerThresholds: Codable, Sendable, Equatable {
  public let notACard: Float
  public let orientationMargin: Float
  public let artMargin: Float
}

public struct GalleryHeader: Codable, Sendable {
  public static let float16 = "float16"

  public let count: Int
  public let model: FeaturePrintModel
  public let thresholds: RecognizerThresholds
  public let createdAt: String
  public let encoding: String?
  public let version: String?

  public init(
    count: Int,
    model: FeaturePrintModel,
    thresholds: RecognizerThresholds,
    createdAt: String,
    encoding: String?,
    version: String? = nil
  ) {
    self.count = count
    self.model = model
    self.thresholds = thresholds
    self.createdAt = createdAt
    self.encoding = encoding
    self.version = version
  }
}

public enum GalleryFile {
  public static let printingList = "catalog.json"
  public static let header = "gallery.json"
  public static let float16Vectors = "gallery.f16"
  public static let modelPackage = "model.mlpackage"
  public static let compiledModel = "model.mlmodelc"
}

public struct GalleryManifest: Codable, Sendable {
  public static let formatVersion = 2

  public struct Encoding: Codable, Sendable {
    public let type: String
    public let scale: String
  }

  public struct Part: Codable, Sendable {
    public static let gallery = "gallery"
    public static let printingList = "printing_list"
    public static let model = "model"

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
  public let encoding: Encoding?
  public let version: String
  public let builtAt: String
  public let model: FeaturePrintModel
  public let thresholds: RecognizerThresholds
  public let rows: Int
  public let parts: [Part]
}

