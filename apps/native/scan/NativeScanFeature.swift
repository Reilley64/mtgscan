import UIKit

@MainActor
final class NativeScanFeature {
  let page: ScanPage

  init(catalog: any CatalogService) {
    let camera = NativeScanCamera()
    let recognizer = NativeScanRecognizer()
    let feedback = NativeScanFeedback()
    let review = ScanReviewController(files: NativeScanFiles())
    let choices = ScanChoicesController(local: recognizer) { accountID, printingID in
      let cards = try await catalog.cards(
        accountID: accountID, oracleID: nil, printingID: printingID)
      return cards.items.first?.printing?.imageUris.first
    }
    let capture = ScanCaptureController(camera: camera, recognizer: recognizer, review: review) {
      feedback.play($0)
    }
    camera.onSample = { [weak capture] in capture?.observe($0) }
    page = ScanPage(
      review: review, capture: capture, choices: choices, preview: camera, images: HTTPSCardImages()
    )
    page.onAddCopy = { feedback.play(.recognized) }
  }
}
