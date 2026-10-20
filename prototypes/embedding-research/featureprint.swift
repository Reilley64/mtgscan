
import CoreImage
import Foundation
import Vision

// usage: swift featureprint.swift list.txt out.f32 [rot180]
let args = CommandLine.arguments
let paths = try! String(contentsOfFile: args[1], encoding: .utf8).split(separator: "\n").map(String.init)
let rotate = args.count > 3 && args[3] == "rot180"
let context = CIContext(options: [.cacheIntermediates: false])
var out = Data()
for path in paths {
  var image = CIImage(contentsOf: URL(fileURLWithPath: path), options: [.applyOrientationProperty: true])!
  image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  if rotate {
    image = image.transformed(by: CGAffineTransform(rotationAngle: .pi))
    image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  }
  let card = context.createCGImage(image, from: image.extent)!
  let source = CIImage(cgImage: card)
  let scaled = source.transformed(by: CGAffineTransform(scaleX: 488 / source.extent.width, y: 680 / source.extent.height))
  let small = context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: 488, height: 680))!
  let request = VNGenerateImageFeaturePrintRequest()
  request.revision = VNGenerateImageFeaturePrintRequestRevision2
  request.imageCropAndScaleOption = .scaleFill
  try! VNImageRequestHandler(cgImage: small, options: [:]).perform([request])
  let obs = request.results!.first!
  var v = obs.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  let n = sqrt(v.reduce(0) { $0 + $1 * $1 })
  v = v.map { $0 / n }
  v.withUnsafeBytes { out.append(contentsOf: $0) }
}
try! out.write(to: URL(fileURLWithPath: args[2]))
