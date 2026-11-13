import Foundation

actor GalleryDownloadCommands {
  private let taskInventory: @Sendable () async -> [URLSessionTask]
  private var generation = 0

  init(taskInventory: @escaping @Sendable () async -> [URLSessionTask]) {
    self.taskInventory = taskInventory
  }

  func download(_ start: @Sendable ([URLSessionTask]) throws -> Void) async throws {
    generation += 1
    let operation = generation
    let tasks = await taskInventory()
    guard operation == generation else { return }
    try start(tasks)
  }

  func cancel(_ stop: @Sendable ([URLSessionTask]) -> Bool) async -> Bool {
    generation += 1
    let operation = generation
    let tasks = await taskInventory()
    guard operation == generation else { return false }
    return stop(tasks)
  }
}
