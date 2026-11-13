import Foundation

@objc(MTGScanGalleryLifecycle)
final class GalleryAppLifecycle: NSObject {
  @objc(handleEventsForSession:completion:)
  static func handleEvents(forSession identifier: String, completion: @escaping () -> Void) {
    nonisolated(unsafe) let done = completion
    GalleryDownloads.handleBackgroundEvents(identifier: identifier) { done() }
  }
}
