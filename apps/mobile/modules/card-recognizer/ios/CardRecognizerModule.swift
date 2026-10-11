import ExpoModulesCore

struct OutlinePoint: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

actor InstalledGallery {
  private var loaded: Gallery?

  func gallery() throws(RecognitionFailure) -> Gallery {
    if let loaded { return loaded }
    guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
          let gallery = try? Gallery(directory: support.appendingPathComponent("gallery", isDirectory: true))
    else { throw .galleryNotReady }
    loaded = gallery
    return gallery
  }
}

public final class CardRecognizerModule: Module {
  private let installedGallery = InstalledGallery()

  public func definition() -> ModuleDefinition {
    let installedGallery = installedGallery

    Name("CardRecognizer")

    AsyncFunction("recognize") { (photo: URL, outline: [OutlinePoint]) async throws -> [String: Any] in
      let recognition: Recognition
      do throws(RecognitionFailure) {
        guard outline.count == 4 else { throw .rectificationFailed }
        recognition = try CardRecognizer.recognize(
          photo: photo,
          outline: CardOutline(corners: outline.map { CGPoint(x: $0.x, y: $0.y) }),
          gallery: try await installedGallery.gallery()
        )
      } catch {
        throw Exception(name: "RecognitionError", description: error.code, code: error.code)
      }
      return try Self.javaScriptObject(recognition)
    }
  }

  private static func javaScriptObject(_ recognition: Recognition) throws -> [String: Any] {
    let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(recognition))
    return object as? [String: Any] ?? [:]
  }
}
