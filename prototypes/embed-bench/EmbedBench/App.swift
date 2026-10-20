import SwiftUI

@main
struct EmbedBenchApp: App {
  @State private var status = "running"
  var body: some Scene {
    WindowGroup {
      Text(status).padding().task {
        UIApplication.shared.isIdleTimerDisabled = true
        let tasks = Array(ProcessInfo.processInfo.arguments.dropFirst()).filter { $0.contains(":") }
        await Task.detached(priority: .userInitiated) { Bench.run(tasks) }.value
        status = "done"
        exit(0)
      }
    }
  }
}
