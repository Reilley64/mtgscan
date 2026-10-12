import ExpoModulesCore

struct OutlinePoint: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct GalleryDownloadRequest: Record {
  @Field var version: String = ""
  @Field var manifest: String = ""
  @Field var urls: [String: String] = [:]
  @Field var allowsCellularAccess: Bool = false
}

actor InstalledGallery {
  private var loaded: Gallery?

  func gallery() throws(RecognitionFailure) -> Gallery {
    if let loaded { return loaded }
    guard let gallery = try? Gallery(directory: GalleryDownloads.installedDirectory) else { throw .galleryNotReady }
    loaded = gallery
    return gallery
  }

  func reload() {
    loaded = nil
  }
}

public final class CardRecognizerModule: Module {
  private let installedGallery = InstalledGallery()

  public func definition() -> ModuleDefinition {
    let installedGallery = installedGallery

    Name("CardRecognizer")

    Events("onGalleryDownload")

    OnCreate {
      let events = GalleryDownloadEvents(module: self)
      GalleryDownloads.shared.listen { status in
        Task {
          if status.state == .installed { await installedGallery.reload() }
          events.send(status)
        }
      }
    }

    AsyncFunction("installedGallery") { () -> [String: String]? in
      GalleryDownloads.installedVersion().map { ["version": $0.version, "builtAt": $0.builtAt] }
    }

    AsyncFunction("galleryDownloadStatus") { () async -> [String: Any]? in
      await GalleryDownloads.shared.currentStatus()?.javaScriptObject
    }

    AsyncFunction("downloadGallery") { (request: GalleryDownloadRequest) async throws in
      try await GalleryDownloads.shared.download(
        version: request.version,
        manifest: Data(request.manifest.utf8),
        urls: request.urls.compactMapValues { URL(string: $0) },
        allowsCellularAccess: request.allowsCellularAccess
      )
    }

    AsyncFunction("recognize") { (photo: URL, outline: [OutlinePoint]) async throws -> [String: Any] in
      let recognition: Recognition
      do throws(RecognitionFailure) {
        recognition = try CardRecognizer.recognize(
          photo: photo,
          outline: try CardOutline(corners: outline.map { CGPoint(x: $0.x, y: $0.y) }),
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

private final class GalleryDownloadEvents: @unchecked Sendable {
  private weak var module: CardRecognizerModule?

  init(module: CardRecognizerModule) {
    self.module = module
  }

  func send(_ status: GalleryDownloadStatus) {
    module?.sendEvent("onGalleryDownload", status.javaScriptObject)
  }
}

public final class GalleryDownloadsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == GalleryDownloads.sessionIdentifier else {
      completionHandler()
      return
    }
    nonisolated(unsafe) let done = completionHandler
    GalleryDownloads.shared.handleBackgroundEvents { done() }
  }
}
