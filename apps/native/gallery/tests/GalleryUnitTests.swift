import Foundation

func galleryManifest(
  version: String = "base", model: String = "pe-core-s16-384", thresholds: String = "0.5",
  addOn: Bool = false
) throws -> GalleryManifest {
  let parts = """
    {"name":"base-gallery.zlib","kind":"gallery","addOn":0,"firstRow":0,"rowCount":1,"compressedBytes":3,"rawBytes":2,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"},
    {"name":"base-printings.zlib","kind":"printing_list","addOn":0,"firstRow":0,"rowCount":1,"compressedBytes":3,"rawBytes":20,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"},
    {"name":"base-model.zlib","kind":"model","addOn":0,"firstRow":0,"rowCount":0,"compressedBytes":3,"rawBytes":20,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}
    """
  let extra =
    addOn
    ? """
    ,{"name":"1-gallery.zlib","kind":"gallery","addOn":1,"firstRow":0,"rowCount":1,"compressedBytes":3,"rawBytes":2,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"},
    {"name":"1-printings.zlib","kind":"printing_list","addOn":1,"firstRow":0,"rowCount":1,"compressedBytes":3,"rawBytes":20,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}
    """ : ""
  return try JSONDecoder().decode(
    GalleryManifest.self,
    from: Data(
      """
      {"formatVersion":2,"version":"\(version)","builtAt":"2026-11-13T00:00:00Z",
      "model":{"name":"\(model)","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","inputSize":{"width":384,"height":384},"vectorSize":2},
      "thresholds":{"notACard":\(thresholds),"orientationMargin":0.01,"artMargin":0.02},
      "rows":\(addOn ? 2 : 1),"parts":[\(parts)\(extra)]}
      """.utf8))
}

@main
struct GalleryUnitTests {
  @MainActor
  static func main() async throws {
    let base = try galleryManifest()
    let update = try galleryManifest(version: "update", addOn: true)
    let missing = try GalleryPolicy.partsNeeded(update, installed: base)
    precondition(
      missing.map(\.name) == ["1-gallery.zlib", "1-printings.zlib"],
      "An add-on downloads only missing parts")
    for changed in [
      try galleryManifest(version: "changed", model: "another-model", addOn: true),
      try galleryManifest(version: "changed", thresholds: "0.7", addOn: true),
    ] {
      do {
        _ = try GalleryPolicy.partsNeeded(changed, installed: base)
        preconditionFailure("An add-on must not reuse a different model or recognizer thresholds")
      } catch GalleryFailure.unsupported {}
    }
    let newBase = try galleryManifest(version: "new-base", thresholds: "0.7")
    let baseParts = try GalleryPolicy.partsNeeded(newBase, installed: base)
    precondition(
      baseParts.count == 3,
      "A new base installs all parts, including its model")
    precondition(
      GalleryInstaller.partMatches(base.parts[0], data: Data("abc".utf8)),
      "The known SHA-256 of abc verifies")
    precondition(
      !GalleryInstaller.partMatches(base.parts[0], data: Data("abd".utf8)),
      "A same-size corrupt download fails SHA-256 verification")
    let validData = try JSONEncoder().encode(base)
    let unsupportedEncoding = Data(
      String(decoding: validData, as: UTF8.self)
        .replacingOccurrences(
          of: "\"formatVersion\":2",
          with: "\"formatVersion\":2,\"encoding\":{\"type\":\"float32\",\"scale\":\"per_vector\"}"
        ).utf8)
    do {
      _ = try GalleryPolicy.manifest(unsupportedEncoding, version: "base")
      preconditionFailure("An unsupported encoding cannot be installed")
    } catch GalleryFailure.unsupported {}
    let unsafeData = Data(
      String(decoding: validData, as: UTF8.self)
        .replacingOccurrences(of: "base-gallery.zlib", with: "../gallery.zlib").utf8)
    do {
      _ = try GalleryPolicy.manifest(unsafeData, version: "base")
      preconditionFailure("A manifest cannot write outside its gallery download folder")
    } catch GalleryFailure.corrupt {}
    precondition(
      GalleryInstaller.modelShapeMatches(
        input: [1, 3, 384, 384], output: [1, 2], model: base.model))
    precondition(
      !GalleryInstaller.modelShapeMatches(
        input: [1, 3, 224, 224], output: [1, 2], model: base.model),
      "A gallery never activates with a different model input size")
    precondition(
      !GalleryInstaller.modelShapeMatches(
        input: [1, 3, 384, 384], output: [1, 3], model: base.model),
      "A gallery never activates with a different feature print size")
    try await runGalleryControllerTests()
    try await runGalleryStorageTests()
    print("Gallery unit checks passed")
  }
}
