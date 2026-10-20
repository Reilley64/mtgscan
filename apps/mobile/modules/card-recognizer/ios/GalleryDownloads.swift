import Foundation
import Network
import UIKit

struct GalleryDownloadStatus: Sendable, Equatable {
  enum State: String, Sendable {
    case downloading
    case waitingForWifi = "waiting_for_wifi"
    case waitingForNetwork = "waiting_for_network"
    case installing
    case installed
    case failed
    case notEnoughSpace = "not_enough_space"
  }

  let version: String
  let state: State
  var bytesDone: Int64 = 0
  var bytesTotal: Int64 = 0
  var bytesNeeded: Int64 = 0

  var javaScriptObject: [String: Any] {
    var object: [String: Any] = [
      "version": version,
      "state": state.rawValue,
      "bytesDone": bytesDone,
      "bytesTotal": bytesTotal,
    ]
    if state == .notEnoughSpace { object["bytesNeeded"] = bytesNeeded }
    return object
  }
}

struct InstalledGalleryVersion: Sendable {
  let version: String
  let builtAt: String
}

final class GalleryDownloads: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
  static let shared = GalleryDownloads()
  static let sessionIdentifier = "dev.reilley.mtgscan.gallery"
  static let downloadsAgainPerPart = 3
  static let networkRetrySeconds = 30.0

  private struct Job {
    let version: String
    let manifest: GalleryManifest
    let directory: URL
    var urls: [String: URL]
    var allowsCellularAccess: Bool
    var pending: Set<String>
    var attempts: [String: Int] = [:]
    var written: [String: Int64] = [:]
    var resumed: Set<String> = []
    var refused: Set<String> = []
    var bytesTotal: Int64
    var bytesVerified: Int64
    var installing = false

    var bytesDone: Int64 { bytesVerified + written.values.reduce(0, +) }
  }

  private let queue = DispatchQueue(label: "dev.reilley.mtgscan.gallery-downloads")
  private let installQueue = DispatchQueue(label: "dev.reilley.mtgscan.gallery-install", qos: .userInitiated)
  private let pathMonitor = NWPathMonitor()
  private var path: NWPath?
  private var job: Job?
  private var status: GalleryDownloadStatus?
  private var lastProgressSentAt = Date.distantPast
  private var cancelledOnPurpose: Set<Int> = []
  private var backgroundEventsDone: (@Sendable () -> Void)?
  private var listener: (@Sendable (GalleryDownloadStatus) -> Void)?
  private var session: URLSession!

  static var installedDirectory: URL { supportDirectory.appendingPathComponent("gallery", isDirectory: true) }
  private static var downloadsDirectory: URL {
    supportDirectory.appendingPathComponent("gallery-download", isDirectory: true)
  }
  private static var supportDirectory: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  }

  override private init() {
    super.init()
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    let delegateQueue = OperationQueue()
    delegateQueue.maxConcurrentOperationCount = 1
    delegateQueue.underlyingQueue = queue
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    pathMonitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      self.path = path
      self.sendPendingStatus(force: true)
    }
    pathMonitor.start(queue: queue)
    queue.async {
      self.removeAbandonedStaging()
      self.restoreJob()
    }
  }

  func listen(_ listener: @escaping @Sendable (GalleryDownloadStatus) -> Void) {
    queue.async { self.listener = listener }
  }

  func handleBackgroundEvents(completion: @escaping @Sendable () -> Void) {
    queue.async { self.backgroundEventsDone = completion }
  }

  func currentStatus() async -> GalleryDownloadStatus? {
    await withCheckedContinuation { continuation in
      queue.async { continuation.resume(returning: self.status) }
    }
  }

  static func installedVersion() -> InstalledGalleryVersion? {
    guard let data = try? Data(contentsOf: installedDirectory.appendingPathComponent(GalleryFile.header)),
          let header = try? JSONDecoder().decode(GalleryHeader.self, from: data),
          let version = header.version
    else { return nil }
    return InstalledGalleryVersion(version: version, builtAt: header.createdAt)
  }

  func download(version: String, manifest manifestData: Data, urls: [String: URL], allowsCellularAccess: Bool) async throws {
    let manifest = try GalleryInstaller.manifest(from: manifestData)
    guard manifest.version == version else {
      throw GalleryInstaller.Failure.unsupportedManifest("the manifest names gallery version \(manifest.version)")
    }
    let tasks = await session.allTasks
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      queue.async {
        do {
          try self.start(manifest: manifest, data: manifestData, urls: urls, allowsCellularAccess: allowsCellularAccess, tasks: tasks)
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func start(
    manifest: GalleryManifest,
    data: Data,
    urls: [String: URL],
    allowsCellularAccess: Bool,
    tasks: [URLSessionTask]
  ) throws {
    let version = manifest.version
    if Self.installedVersion()?.version == version {
      tasks.forEach(cancelOnPurpose)
      job = nil
      send(GalleryDownloadStatus(version: version, state: .installed))
      return
    }
    if job?.installing == true { return }
    let directory = Self.downloadsDirectory.appendingPathComponent(version, isDirectory: true)
    try prepare(directory: directory, manifestData: data)
    let needed = GalleryInstaller.partsToDownload(manifest, over: Self.installedDirectory)
    var pending = Set<String>()
    var bytesVerified: Int64 = 0
    for part in needed {
      let file = directory.appendingPathComponent(part.name)
      if GalleryInstaller.partMatches(part, file: file) {
        bytesVerified += Int64(part.compressedBytes)
      } else {
        try? FileManager.default.removeItem(at: file)
        pending.insert(part.name)
      }
    }
    let previous = job?.version == version ? job : nil
    job = Job(
      version: version,
      manifest: manifest,
      directory: directory,
      urls: urls,
      allowsCellularAccess: allowsCellularAccess || (previous?.allowsCellularAccess ?? false),
      pending: pending,
      attempts: previous?.attempts.filter { pending.contains($0.key) } ?? [:],
      written: [:],
      bytesTotal: needed.reduce(0) { $0 + Int64($1.compressedBytes) },
      bytesVerified: bytesVerified
    )
    let bytesNeeded = spaceNeeded(for: manifest, pending: needed.filter { pending.contains($0.name) })
    if let available = Self.availableBytes(), available < bytesNeeded {
      tasks.forEach(cancelOnPurpose)
      job = nil
      send(GalleryDownloadStatus(version: version, state: .notEnoughSpace, bytesNeeded: bytesNeeded))
      return
    }
    if pending.isEmpty {
      tasks.forEach(cancelOnPurpose)
      install()
      return
    }
    var running = Set<String>()
    for task in tasks {
      guard let (taskVersion, part) = Self.taskPart(task), taskVersion == version, pending.contains(part),
            task.state == .running || task.state == .suspended,
            !(job!.allowsCellularAccess && task.originalRequest?.allowsCellularAccess == false)
      else {
        cancelOnPurpose(task)
        continue
      }
      running.insert(part)
    }
    for part in pending.subtracting(running) {
      startTask(part: part)
    }
    sendPendingStatus(force: true)
  }

  private func prepare(directory: URL, manifestData: Data) throws {
    let fileManager = FileManager.default
    try fileManager.createDirectory(at: Self.downloadsDirectory, withIntermediateDirectories: true)
    try Self.excludeFromBackup(Self.downloadsDirectory)
    for other in (try? fileManager.contentsOfDirectory(at: Self.downloadsDirectory, includingPropertiesForKeys: nil)) ?? []
    where other.lastPathComponent != directory.lastPathComponent {
      try? fileManager.removeItem(at: other)
    }
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    try manifestData.write(to: directory.appendingPathComponent(GalleryInstaller.manifestFile), options: .atomic)
  }

  private func spaceNeeded(for manifest: GalleryManifest, pending: [GalleryManifest.Part]) -> Int64 {
    let vectors = Int64(manifest.rows * manifest.model.vectorSize * MemoryLayout<Float16>.size)
    let printingList = manifest.parts
      .filter { $0.kind == GalleryManifest.Part.printingList }
      .reduce(Int64(0)) { $0 + Int64($1.rawBytes) }
    return pending.reduce(Int64(0)) { $0 + Int64($1.compressedBytes) } + vectors + printingList
  }

  private static func availableBytes() -> Int64? {
    let values = try? supportDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return values?.volumeAvailableCapacityForImportantUsage
  }

  private static func excludeFromBackup(_ directory: URL) throws {
    var url = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }

  private static func taskPart(_ task: URLSessionTask) -> (String, String)? {
    let fields = task.taskDescription?.split(separator: "/", maxSplits: 1).map(String.init) ?? []
    return fields.count == 2 ? (fields[0], fields[1]) : nil
  }

  private func cancelOnPurpose(_ task: URLSessionTask) {
    cancelledOnPurpose.insert(task.taskIdentifier)
    task.cancel()
  }

  private func resumeDataFile(_ part: String) -> URL? {
    job?.directory.appendingPathComponent("\(part).resume")
  }

  private func startTask(part: String, resuming: Bool = true) {
    guard let job else { return }
    let resumeFile = resumeDataFile(part)
    let resumeData = resuming && !job.allowsCellularAccess ? resumeFile.flatMap { try? Data(contentsOf: $0) } : nil
    if let resumeFile { try? FileManager.default.removeItem(at: resumeFile) }
    self.job?.written[part] = nil
    let task: URLSessionDownloadTask
    if let resumeData {
      task = session.downloadTask(withResumeData: resumeData)
      self.job?.resumed.insert(part)
    } else if let url = job.urls[part] {
      var request = URLRequest(url: url)
      request.allowsCellularAccess = job.allowsCellularAccess
      task = session.downloadTask(with: request)
      self.job?.resumed.remove(part)
    } else {
      return
    }
    task.taskDescription = "\(job.version)/\(part)"
    task.countOfBytesClientExpectsToReceive = Int64(job.manifest.parts.first { $0.name == part }?.compressedBytes ?? 0)
    task.resume()
  }

  private func fail() {
    guard let job else { return }
    session.getAllTasks { tasks in
      self.queue.async { tasks.forEach(self.cancelOnPurpose) }
    }
    self.job = nil
    send(GalleryDownloadStatus(
      version: job.version,
      state: .failed,
      bytesDone: job.bytesDone,
      bytesTotal: job.bytesTotal
    ))
  }

  private func pendingState(of job: Job) -> GalleryDownloadStatus.State {
    guard let path else { return .downloading }
    if path.status != .satisfied { return .waitingForNetwork }
    if !job.allowsCellularAccess, !path.usesInterfaceType(.wifi), !path.usesInterfaceType(.wiredEthernet),
       path.usesInterfaceType(.cellular) {
      return .waitingForWifi
    }
    return .downloading
  }

  private func sendPendingStatus(force: Bool) {
    guard let job, !job.installing else { return }
    let now = Date()
    guard force || now.timeIntervalSince(lastProgressSentAt) >= 0.25 else { return }
    lastProgressSentAt = now
    send(GalleryDownloadStatus(
      version: job.version,
      state: pendingState(of: job),
      bytesDone: job.bytesDone,
      bytesTotal: job.bytesTotal
    ))
  }

  private func send(_ next: GalleryDownloadStatus) {
    status = next
    listener?(next)
  }

  private func install() {
    guard var job, !job.installing else { return }
    job.installing = true
    self.job = job
    send(GalleryDownloadStatus(version: job.version, state: .installing, bytesDone: job.bytesTotal, bytesTotal: job.bytesTotal))
    let directory = job.directory
    let version = job.version
    installQueue.async {
      let background = BackgroundActivity(name: "Install the gallery")
      defer { background.end() }
      let result = Result(catching: {
        try FileManager.default.createDirectory(
          at: Self.installedDirectory.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        try GalleryInstaller.install(from: directory, into: Self.installedDirectory)
        try Self.excludeFromBackup(Self.installedDirectory)
      })
      self.queue.async {
        guard self.job?.version == version else { return }
        self.job = nil
        switch result {
        case .success:
          try? FileManager.default.removeItem(at: directory)
          self.send(GalleryDownloadStatus(version: version, state: .installed))
        case .failure:
          self.send(GalleryDownloadStatus(version: version, state: .failed))
        }
      }
    }
  }

  private func restoreJob() {
    let directories = (try? FileManager.default.contentsOfDirectory(
      at: Self.downloadsDirectory, includingPropertiesForKeys: nil
    )) ?? []
    guard directories.count == 1, let directory = directories.first,
          let manifest = try? GalleryInstaller.manifest(in: directory),
          manifest.version == directory.lastPathComponent
    else { return }
    let needed = GalleryInstaller.partsToDownload(manifest, over: Self.installedDirectory)
    let verified = needed.filter { GalleryInstaller.partMatches($0, file: directory.appendingPathComponent($0.name)) }
    job = Job(
      version: manifest.version,
      manifest: manifest,
      directory: directory,
      urls: [:],
      allowsCellularAccess: false,
      pending: Set(needed.map(\.name)).subtracting(verified.map(\.name)),
      bytesTotal: needed.reduce(0) { $0 + Int64($1.compressedBytes) },
      bytesVerified: verified.reduce(0) { $0 + Int64($1.compressedBytes) }
    )
  }

  private func removeAbandonedStaging() {
    let parent = Self.installedDirectory.deletingLastPathComponent()
    let prefix = ".\(Self.installedDirectory.lastPathComponent)-"
    for item in (try? FileManager.default.contentsOfDirectory(atPath: parent.path)) ?? [] where item.hasPrefix(prefix) {
      try? FileManager.default.removeItem(at: parent.appendingPathComponent(item))
    }
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    guard let (version, part) = Self.taskPart(downloadTask), job?.version == version, job?.pending.contains(part) == true
    else { return }
    job?.written[part] = totalBytesWritten
    sendPendingStatus(force: false)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let (version, partName) = Self.taskPart(downloadTask), let job, job.version == version,
          job.pending.contains(partName), let part = job.manifest.parts.first(where: { $0.name == partName })
    else { return }
    let statusCode = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200 ..< 300).contains(statusCode) else {
      if job.resumed.contains(partName) || !job.refused.contains(partName) {
        self.job?.refused.insert(partName)
        startTask(part: partName, resuming: false)
      } else {
        fail()
      }
      return
    }
    let file = job.directory.appendingPathComponent(partName)
    try? FileManager.default.removeItem(at: file)
    guard (try? FileManager.default.moveItem(at: location, to: file)) != nil,
          GalleryInstaller.partMatches(part, file: file)
    else {
      try? FileManager.default.removeItem(at: file)
      let attempts = (job.attempts[partName] ?? 0) + 1
      self.job?.attempts[partName] = attempts
      if attempts > Self.downloadsAgainPerPart {
        fail()
      } else {
        startTask(part: partName, resuming: false)
      }
      return
    }
    self.job?.pending.remove(partName)
    self.job?.written[partName] = nil
    self.job?.bytesVerified += Int64(part.compressedBytes)
    if self.job?.pending.isEmpty == true {
      install()
    } else {
      sendPendingStatus(force: true)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error else { return }
    if cancelledOnPurpose.remove(task.taskIdentifier) != nil { return }
    guard let (version, part) = Self.taskPart(task), job?.version == version, job?.pending.contains(part) == true
    else { return }
    let nsError = error as NSError
    if let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data, let file = resumeDataFile(part) {
      try? resumeData.write(to: file)
    }
    job?.written[part] = nil
    let forceQuit = (nsError.userInfo[NSURLErrorBackgroundTaskCancelledReasonKey] as? Int)
      == NSURLErrorCancelledReasonUserForceQuitApplication
    if forceQuit || nsError.code == NSURLErrorCancelled {
      sendPendingStatus(force: true)
      return
    }
    sendPendingStatus(force: true)
    queue.asyncAfter(deadline: .now() + Self.networkRetrySeconds) {
      self.session.getAllTasks { tasks in
        self.queue.async {
          guard self.job?.version == version, self.job?.pending.contains(part) == true,
                !tasks.contains(where: { Self.taskPart($0).map { $0 == (version, part) } ?? false })
          else { return }
          self.startTask(part: part)
        }
      }
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let done = backgroundEventsDone
    backgroundEventsDone = nil
    if let done { DispatchQueue.main.async { done() } }
  }
}

private final class BackgroundActivity: @unchecked Sendable {
  private var identifier: UIBackgroundTaskIdentifier = .invalid

  init(name: String) {
    DispatchQueue.main.sync {
      MainActor.assumeIsolated {
        identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in self?.end() }
      }
    }
  }

  func end() {
    DispatchQueue.main.async {
      MainActor.assumeIsolated {
        guard self.identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(self.identifier)
        self.identifier = .invalid
      }
    }
  }
}
