@MainActor
struct IdleTimerTests {
  static func run() {
    var disabled = false
    let testApp = TestAppIdleTimer(bundleIdentifier: "dev.reilley.mtgscan.test") {
      disabled = $0
    }
    testApp.setActive(true)
    precondition(disabled)
    testApp.setActive(false)
    precondition(!disabled)
    testApp.setActive(false)
    precondition(!disabled)
    testApp.setActive(true)
    precondition(disabled)
    testApp.setActive(false)
    precondition(!disabled)

    for bundle in ["dev.reilley.mtgscan", "another.app", nil] {
      var changed = false
      let otherApp = TestAppIdleTimer(bundleIdentifier: bundle) { _ in changed = true }
      otherApp.setActive(true)
      otherApp.setActive(false)
      precondition(!changed)
    }
  }
}
