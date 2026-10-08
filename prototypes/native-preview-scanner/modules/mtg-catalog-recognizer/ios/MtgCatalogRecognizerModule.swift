import ExpoModulesCore
import Foundation

public class MtgCatalogRecognizerModule: Module {
  private var catalog: MTGCardCatalog?
  private let catalogFiles = ["gallery.json", "catalog.json", "gallery.f16"]

  enum Failure: Error, CustomStringConvertible {
    case notPrepared
    case download(String, Int)
    case invalidQuad

    var description: String {
      switch self {
      case .notPrepared: return "catalog recognizer is not prepared"
      case let .download(path, status): return "download of \(path) failed with status \(status)"
      case .invalidQuad: return "quad must have four [x, y] points"
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("MtgCatalogRecognizer")

    AsyncFunction("prepare") { (baseUrl: String, token: String) async throws -> [String: Any] in
      let directory = try self.catalogDirectory()
      let startedAt = Date()
      let remoteHeader = try await self.fetch(baseUrl: baseUrl, token: token, path: "catalog/files/gallery.json")
      let localHeader = try? Data(contentsOf: directory.appendingPathComponent("gallery.json"))
      var downloadedBytes = 0
      if localHeader != remoteHeader || self.catalogFiles.contains(where: {
        !FileManager.default.fileExists(atPath: directory.appendingPathComponent($0).path)
      }) {
        for file in ["catalog.json", "gallery.f16"] {
          downloadedBytes += try await self.download(
            baseUrl: baseUrl, token: token, path: "catalog/files/\(file)",
            to: directory.appendingPathComponent(file)
          )
        }
        try remoteHeader.write(to: directory.appendingPathComponent("gallery.json"))
      }
      let downloadMs = Date().timeIntervalSince(startedAt) * 1000
      let loadStartedAt = Date()
      self.catalog = nil
      let loaded = try MTGCardCatalog(directory: directory)
      self.catalog = loaded
      return [
        "printings": loaded.printings.count,
        "downloadedBytes": downloadedBytes,
        "downloadMs": downloadMs.rounded(),
        "loadMs": (Date().timeIntervalSince(loadStartedAt) * 1000).rounded(),
        "footprintMb": Self.footprintMegabytes(),
      ]
    }

    AsyncFunction("checkParity") { (baseUrl: String, token: String, count: Int) async throws -> [String: Any] in
      guard let catalog = self.catalog else { throw Failure.notPrepared }
      let step = max(1, catalog.printings.count / max(1, count))
      var cosines: [Double] = []
      var failures: [String] = []
      for index in stride(from: 0, to: catalog.printings.count, by: step).prefix(count) {
        let id = catalog.printings[index].id
        do {
          let data = try await self.fetch(baseUrl: baseUrl, token: token, path: "catalog/images/\(id).jpg")
          let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(id).jpg")
          try data.write(to: file)
          defer { try? FileManager.default.removeItem(at: file) }
          guard let image = MTGCardRectifier.loadOrientedImage(at: file),
                let card = MTGCardRectifier.context.createCGImage(image, from: image.extent),
                let small = MTGCardRectifier.resized(
                  card, width: MTGCardRecognizer.embedWidth, height: MTGCardRecognizer.embedHeight
                )
          else { throw MTGCardRecognizer.Failure.unreadableImage }
          let phoneVector = try MTGCardEmbedder.featurePrint(of: small)
          let galleryVector = catalog.vector(at: index)
          cosines.append(Double(zip(phoneVector, galleryVector).reduce(0) { $0 + $1.0 * $1.1 }))
        } catch {
          failures.append("\(id): \(error)")
        }
      }
      return [
        "checked": cosines.count,
        "minCosine": cosines.min() ?? 0,
        "meanCosine": cosines.isEmpty ? 0 : cosines.reduce(0, +) / Double(cosines.count),
        "failures": failures,
      ]
    }

    AsyncFunction("recognize") { (photoPath: String, quad: [[Double]]) throws -> [String: Any] in
      guard let catalog = self.catalog else { throw Failure.notPrepared }
      guard quad.count == 4, quad.allSatisfy({ $0.count == 2 }) else { throw Failure.invalidQuad }
      let startedAt = Date()
      let path = photoPath.hasPrefix("file://") ? String(photoPath.dropFirst(7)) : photoPath
      let crop = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
      defer { try? FileManager.default.removeItem(at: crop) }
      let recognition = try MTGCardRecognizer.recognize(
        photo: URL(fileURLWithPath: path),
        quad: MTGCardQuad(corners: quad.map { CGPoint(x: $0[0], y: $0[1]) }),
        catalog: catalog,
        cropOutput: crop
      )
      let encoded = try JSONEncoder().encode(recognition)
      var result = try JSONSerialization.jsonObject(with: encoded) as? [String: Any] ?? [:]
      result["totalMs"] = (Date().timeIntervalSince(startedAt) * 1000).rounded()
      result["cropJpegBase64"] = (try? Data(contentsOf: crop))?.base64EncodedString() ?? ""
      return result
    }
  }

  private func catalogDirectory() throws -> URL {
    let directory = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ).appendingPathComponent("mtg-catalog", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutable = directory
    try? mutable.setResourceValues(values)
    return directory
  }

  private func request(baseUrl: String, token: String, path: String) -> URLRequest {
    var request = URLRequest(url: URL(string: "\(baseUrl)/\(path)")!)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.timeoutInterval = 120
    return request
  }

  private func fetch(baseUrl: String, token: String, path: String) async throws -> Data {
    let (data, response) = try await URLSession.shared.data(for: request(baseUrl: baseUrl, token: token, path: path))
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw Failure.download(path, status) }
    return data
  }

  private func download(baseUrl: String, token: String, path: String, to destination: URL) async throws -> Int {
    let (temporary, response) = try await URLSession.shared.download(for: request(baseUrl: baseUrl, token: token, path: path))
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw Failure.download(path, status) }
    try? FileManager.default.removeItem(at: destination)
    try FileManager.default.moveItem(at: temporary, to: destination)
    let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
    return (attributes?[.size] as? Int) ?? 0
  }

  private static func footprintMegabytes() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return 0 }
    return (Double(info.phys_footprint) / 1_048_576).rounded()
  }
}
