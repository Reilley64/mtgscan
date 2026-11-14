import Foundation

private actor DelayedGalleryTasks {
  private var delayNext = true
  private var pending: CheckedContinuation<[URLSessionTask], Never>?

  func allTasks() async -> [URLSessionTask] {
    guard delayNext else { return [] }
    delayNext = false
    return await withCheckedContinuation { pending = $0 }
  }

  func waiting() -> Bool { pending != nil }

  func release() {
    pending?.resume(returning: [])
    pending = nil
  }
}

private final class GalleryTransferEffects: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  private var running = 0

  func start() {
    lock.withLock {
      cancelled = false
      running += 1
    }
  }

  func cancel() -> Bool {
    lock.withLock {
      cancelled = true
      running = 0
    }
    return true
  }

  var snapshot: (cancelled: Bool, running: Int) {
    lock.withLock { (cancelled, running) }
  }
}

@MainActor
func runGalleryDownloadCommandTests() async throws {
  let tasks = DelayedGalleryTasks()
  let effects = GalleryTransferEffects()
  let commands = GalleryDownloadCommands { await tasks.allTasks() }
  let download = Task { try await commands.download { _ in effects.start() } }
  while !(await tasks.waiting()) { await Task.yield() }
  let cancelled = await commands.cancel { _ in effects.cancel() }
  precondition(cancelled && effects.snapshot.cancelled)
  await tasks.release()
  try await download.value
  precondition(
    effects.snapshot.cancelled && effects.snapshot.running == 0,
    "A download waiting for task inventory cannot undo successful cancellation")

  let cancelledTasks = DelayedGalleryTasks()
  let retriedEffects = GalleryTransferEffects()
  let retry = GalleryDownloadCommands { await cancelledTasks.allTasks() }
  let cancellation = Task { await retry.cancel { _ in retriedEffects.cancel() } }
  while !(await cancelledTasks.waiting()) { await Task.yield() }
  try await retry.download { _ in retriedEffects.start() }
  await cancelledTasks.release()
  let staleCancellation = await cancellation.value
  precondition(!staleCancellation)
  precondition(
    !retriedEffects.snapshot.cancelled && retriedEffects.snapshot.running == 1,
    "An older cancellation cannot stop a newer explicit retry")
}
