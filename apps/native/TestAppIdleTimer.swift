@MainActor
final class TestAppIdleTimer {
  private let isTestApp: Bool
  private let setDisabled: (Bool) -> Void

  init(bundleIdentifier: String?, setDisabled: @escaping (Bool) -> Void) {
    isTestApp = bundleIdentifier == "dev.reilley.mtgscan.test"
    self.setDisabled = setDisabled
  }

  func setActive(_ active: Bool) {
    guard isTestApp else { return }
    setDisabled(active)
  }
}
