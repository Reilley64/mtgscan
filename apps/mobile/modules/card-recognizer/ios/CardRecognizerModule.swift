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
  private var loadedNames: CardNameIndex?

  func gallery() throws(RecognitionFailure) -> Gallery {
    if let loaded { return loaded }
    guard let gallery = try? Gallery(directory: GalleryDownloads.installedDirectory) else { throw .galleryNotReady }
    loaded = gallery
    return gallery
  }

  func names() throws(RecognitionFailure) -> (Gallery, CardNameIndex) {
    let gallery = try gallery()
    if let loadedNames { return (gallery, loadedNames) }
    let names = CardNameIndex(printings: gallery.printings)
    loadedNames = names
    return (gallery, names)
  }

  func reload() {
    loaded = nil
    loadedNames = nil
  }
}

public final class CardRecognizerModule: Module {
  private let installedGallery = InstalledGallery()

  public func definition() -> ModuleDefinition {
    let installedGallery = installedGallery

    Name("CardRecognizer")

    Events("onGalleryDownload")

    Constant("recognizerVersion") { Self.recognizerVersion }

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
      GalleryDownloads.installedVersion().map { ["version": $0.version, "builtAt": $0.builtAt, "model": $0.model] }
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
      let startedAt = Self.wallClockMs()
      let recognition: Recognition
      do throws(RecognitionFailure) {
        recognition = try CardRecognizer.recognize(
          photo: photo,
          outline: try CardOutline(corners: outline.map { CGPoint(x: $0.x, y: $0.y) }),
          gallery: try await installedGallery.gallery(),
          trainingCropDirectory: Self.trainingCropDirectory
        )
      } catch {
        throw Exception(name: "RecognitionError", description: error.code, code: error.code)
      }
      return [
        "recognition": try Self.javaScriptObject(recognition),
        "times": ["startedAt": startedAt, "endedAt": Self.wallClockMs()],
      ]
    }

    AsyncFunction("checkGalleryParity") { () async throws -> [String: Any] in
      let gallery: Gallery
      do throws(RecognitionFailure) {
        gallery = try await installedGallery.gallery()
      } catch {
        throw Exception(name: "RecognitionError", description: error.code, code: error.code)
      }
      let parity = await GalleryParity.check(gallery: gallery, referenceImage: GalleryParity.scryfallImage)
      return try Self.javaScriptObject(parity)
    }

    AsyncFunction("searchCardNames") { (text: String) async throws -> [[String: String]] in
      let (_, names) = try await Self.galleryNames(installedGallery)
      return names.search(text).map { ["oracleId": $0.oracleId, "name": $0.name] }
    }

    AsyncFunction("cardPrintings") { (oracleId: String) async throws -> [Any] in
      let (gallery, names) = try await Self.galleryNames(installedGallery)
      let printings = names.printings(oracleId: oracleId).map { RecognitionCandidate(printing: gallery.printings[$0]) }
      return try JSONSerialization.jsonObject(with: JSONEncoder().encode(printings)) as? [Any] ?? []
    }
  }

  private static let recognizerVersion: String = {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
    let build = info?["CFBundleVersion"] as? String ?? "unknown"
    return "\(version) (\(build))"
  }()

  private static let trainingCropDirectory = FileManager.default
    .urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("training-crops", isDirectory: true)

  private static func galleryNames(_ installedGallery: InstalledGallery) async throws -> (Gallery, CardNameIndex) {
    do throws(RecognitionFailure) {
      return try await installedGallery.names()
    } catch {
      throw Exception(name: "RecognitionError", description: error.code, code: error.code)
    }
  }

  private static func wallClockMs() -> Double {
    (Date().timeIntervalSince1970 * 1_000).rounded()
  }

  private static func javaScriptObject(_ value: some Encodable) throws -> [String: Any] {
    let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
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
