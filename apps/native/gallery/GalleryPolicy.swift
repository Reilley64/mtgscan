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
    GalleryInstaller.partsToDownload(manifest, installed: installed)
  }
}
