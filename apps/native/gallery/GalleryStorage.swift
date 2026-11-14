import Foundation

@MainActor
final class GalleryStorage: GallerySource {
  private let config: PublicConfiguration
  private let http: URLSession

  init(config: PublicConfiguration, http: URLSession = NoRedirectSession.make()) {
    self.config = config
    self.http = http
  }

  func published(accessToken: String) async throws -> GalleryPointer {
    try JSONDecoder().decode(
      GalleryPointer.self,
      from:
        await read("published.json", accessToken: accessToken))
  }

  func manifest(_ pointer: GalleryPointer, accessToken: String) async throws -> Data {
    guard pointer.manifest == "\(pointer.version)/manifest.json",
      !pointer.version.contains("/"), ![".", "..", ""].contains(pointer.version)
    else { throw GalleryFailure.corrupt }
    return try await read(pointer.manifest, accessToken: accessToken)
  }

  func urls(version: String, parts: [GalleryManifest.Part], accessToken: String) async throws
    -> [String: URL]
  {
    guard !parts.isEmpty else { return [:] }
    var request = URLRequest(
      url: config.supabaseURL.appending(path: "storage/v1/object/sign/gallery"))
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(
      SignRequest(paths: parts.map { "\(version)/\($0.name)" }, expiresIn: 7 * 24 * 60 * 60))
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let data = try await send(request, accessToken: accessToken)
    let replies = try JSONDecoder().decode([SignedPart].self, from: data)
    var urls: [String: URL] = [:]
    for part in parts {
      guard let signed = replies.first(where: { $0.path == "\(version)/\(part.name)" })?.signedURL,
        signed.hasPrefix("/object/sign/gallery/"),
        let url = URL(
          string: config.supabaseURL.absoluteString.trimmingCharacters(
            in: CharacterSet(charactersIn: "/")) + "/storage/v1" + signed),
        url.scheme == "https", url.host == config.supabaseURL.host
      else { throw GalleryFailure.unavailable }
      urls[part.name] = url
    }
    return urls
  }

  private struct SignRequest: Encodable {
    let paths: [String]
    let expiresIn: Int
  }

  private struct SignedPart: Decodable {
    let path: String?
    let signedURL: String?
  }

  private func read(_ path: String, accessToken: String) async throws -> Data {
    try await send(
      URLRequest(
        url: config.supabaseURL.appending(path: "storage/v1/object/authenticated/gallery/\(path)")),
      accessToken: accessToken)
  }

  private func send(_ request: URLRequest, accessToken: String) async throws -> Data {
    var request = request
    request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    do {
      let (data, response) = try await http.data(for: request)
      guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
      else { throw GalleryFailure.unavailable }
      return data
    } catch let error as URLError {
      if [
        .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
        .cannotConnectToHost,
      ].contains(error.code) {
        throw GalleryFailure.offline
      }
      throw GalleryFailure.unavailable
    }
  }
}
