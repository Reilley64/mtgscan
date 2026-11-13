import Foundation

enum GalleryFailure: Error, Equatable {
  case unsupported
  case corrupt
  case offline
  case unavailable
}

enum GalleryPolicy {
  static func manifest(_ data: Data, version: String) throws -> GalleryManifest {
    do {
      let manifest = try GalleryInstaller.manifest(from: data)
      guard manifest.version == version else { throw GalleryFailure.corrupt }
      return manifest
    } catch GalleryInstaller.Failure.unsupportedManifest {
      throw GalleryFailure.unsupported
    } catch { throw GalleryFailure.corrupt }
  }

  static func partsNeeded(_ manifest: GalleryManifest, installed: GalleryManifest?) throws
    -> [GalleryManifest.Part]
  {
    guard let installed else { return manifest.parts }
    let compatible =
      installed.model == manifest.model && installed.thresholds == manifest.thresholds
    let existing = Set(installed.parts.map { "\($0.name)|\($0.sha256)" })
    let wanted = Set(manifest.parts.map { "\($0.name)|\($0.sha256)" })
    if !compatible && manifest.parts.contains(where: { $0.addOn > 0 }),
      !existing.isDisjoint(with: wanted)
    {
      throw GalleryFailure.unsupported
    }
    return GalleryInstaller.partsToDownload(manifest, installed: installed)
  }
}
