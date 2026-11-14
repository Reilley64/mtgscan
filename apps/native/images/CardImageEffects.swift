import CoreImage
import UIKit

@MainActor
enum CardImageEffects {
  static func grayscale(_ image: UIImage) -> UIImage? {
    guard let input = CIImage(image: image),
      let output = CIContext().createCGImage(
        input.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0]),
        from: input.extent)
    else { return nil }
    return UIImage(cgImage: output)
  }
}
