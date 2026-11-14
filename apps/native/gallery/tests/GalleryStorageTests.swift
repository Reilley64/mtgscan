import Foundation

@MainActor
func runGalleryStorageTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let config = PublicConfiguration(
    supabaseURL: URL(string: "https://project.supabase.co")!, publishableKey: "sb_publishable_unit",
    apiURL: URL(string: "https://api.invalid")!, googleIOSClientID: "unused",
    googleServerClientID: "unused")
  let storage = GalleryStorage(config: config, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/storage/v1/object/authenticated/gallery/published.json")
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic-session")
    return (
      200, Data(#"{"formatVersion":2,"version":"base","manifest":"base/manifest.json"}"#.utf8)
    )
  }
  let pointer = try await storage.published(accessToken: "synthetic-session")
  precondition(pointer.version == "base")
  AuthHTTPStub.reply = { _ in
    (
      200,
      Data(
        #"[{"path":"base/base-gallery.zlib","signedURL":"/object/sign/gallery/base/base-gallery.zlib?token=synthetic"}]"#
          .utf8)
    )
  }
  let part = try galleryManifest().parts[0]
  let urls = try await storage.urls(
    version: "base", parts: [part], accessToken: "synthetic-session")
  precondition(
    urls[part.name]?.absoluteString
      == "https://project.supabase.co/storage/v1/object/sign/gallery/base/base-gallery.zlib?token=synthetic",
    "Storage signed paths resolve under the configured HTTPS origin")
  AuthHTTPStub.reply = { _ in
    (
      200,
      Data(
        #"[{"path":"base/base-gallery.zlib","signedURL":"https://untrusted.invalid/model"}]"#.utf8)
    )
  }
  do {
    _ = try await storage.urls(version: "base", parts: [part], accessToken: "synthetic-session")
    preconditionFailure("Unexpected signed URL origins must be refused")
  } catch GalleryFailure.unavailable {}
  AuthHTTPStub.reply = { _ in throw URLError(.notConnectedToInternet) }
  do {
    _ = try await storage.published(accessToken: "synthetic-session")
    preconditionFailure("Offline Storage must expose the retry state")
  } catch GalleryFailure.offline {}
}
