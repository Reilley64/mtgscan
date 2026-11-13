import CoreImage
import UIKit

@MainActor
protocol CardImages {
  func image(uri: String, blur: CGFloat) async -> UIImage?
}

@MainActor
final class HTTPSCardImages: CardImages {
  private let http = NoRedirectSession.make()

  func image(uri: String, blur: CGFloat) async -> UIImage? {
    guard let url = URL(string: uri), url.scheme == "https", url.host != nil,
      url.user == nil, url.password == nil
    else { return nil }
    do {
      let (data, response) = try await http.data(from: url)
      guard let response = response as? HTTPURLResponse, response.statusCode == 200,
        data.count <= 20_000_000, let image = UIImage(data: data)
      else { return nil }
      guard blur > 0, let input = CIImage(image: image) else { return image }
      let result = input.clampedToExtent().applyingFilter(
        "CIGaussianBlur", parameters: [kCIInputRadiusKey: blur]
      ).cropped(to: input.extent)
      guard let rendered = CIContext().createCGImage(result, from: input.extent) else { return nil }
      return UIImage(cgImage: rendered)
    } catch { return nil }
  }
}
