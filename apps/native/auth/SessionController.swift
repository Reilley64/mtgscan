import Foundation

enum Provider: String {
  case apple
  case google
}

struct ProviderCredential {
  let provider: Provider
  let idToken: String
  let nonce: String?
}

struct StoredSession: Codable {
  let accessToken: String
  let refreshToken: String
  let expiresAt: TimeInterval
}

enum SessionFailure: Error {
  case unauthenticated
  case unavailable
  case configuration
  case storage
}

@MainActor
protocol SignInProvider {
  func credential(for provider: Provider) async throws -> ProviderCredential?
  func signOut()
}

@MainActor
protocol SessionStore {
  func load() throws -> StoredSession?
  func save(_ session: StoredSession) throws
  func remove() throws
}

@MainActor
protocol SessionService {
  func exchange(_ credential: ProviderCredential) async throws -> StoredSession
  func refresh(_ token: String) async throws -> StoredSession
  func revoke(_ token: String) async throws
}

@MainActor
protocol CurrentAccountService {
  func currentAccount(accessToken: String) async throws -> String
}

struct SessionPresentation {
  var accountID: String?
  var busy = false
  var message: String?
  var requiresRemoval = false
  var hasSession = false
  var canSignIn: Bool { !busy && !requiresRemoval && !hasSession && accountID == nil }
}

@MainActor
final class SessionController {
  private let provider: any SignInProvider
  private let store: any SessionStore
  private let auth: any SessionService
  private let api: any CurrentAccountService
  private let now: () -> TimeInterval
  private var session: StoredSession?
  private var pendingRevocationToken: String?
  private var generation = 0
  private(set) var presentation = SessionPresentation()
  var onChange: (() -> Void)?

  init(
    provider: any SignInProvider, store: any SessionStore, auth: any SessionService,
    api: any CurrentAccountService,
    now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }
  ) {
    self.provider = provider
    self.store = store
    self.auth = auth
    self.api = api
    self.now = now
  }

  func signIn(_ selected: Provider) async {
    guard presentation.canSignIn else { return }
    generation += 1
    let operation = generation
    presentation = SessionPresentation(busy: true)
    changed()
    do {
      guard let credential = try await provider.credential(for: selected) else {
        finish(operation)
        return
      }
      guard operation == generation else { return }
      let candidate = try await auth.exchange(credential)
      guard operation == generation else { return }
      try store.save(candidate)
      session = candidate
      presentation.hasSession = true
      try await checkAccount(candidate, operation: operation)
    } catch {
      await failed(error, operation: operation)
    }
    finish(operation)
  }

  func resume() async {
    guard !presentation.busy && !presentation.requiresRemoval else { return }
    generation += 1
    let operation = generation
    presentation.busy = true
    presentation.hasSession = true
    presentation.message = nil
    changed()
    do {
      guard var candidate = try session ?? store.load() else {
        presentation.hasSession = false
        finish(operation)
        return
      }
      session = candidate
      presentation.hasSession = true
      if candidate.expiresAt <= now() + 60 {
        candidate = try await auth.refresh(candidate.refreshToken)
        guard operation == generation else { return }
        try store.save(candidate)
        session = candidate
      }
      try await checkAccount(candidate, operation: operation)
    } catch {
      await failed(error, operation: operation)
    }
    finish(operation)
  }

  func refreshIfNeeded() async {
    guard let session, session.expiresAt <= now() + 60 else { return }
    await resume()
  }

  func signOut() async {
    generation += 1
    let operation = generation
    let token = session?.accessToken ?? pendingRevocationToken
    pendingRevocationToken = token
    session = nil
    presentation = SessionPresentation(busy: true)
    provider.signOut()
    changed()
    do {
      try store.remove()
      pendingRevocationToken = nil
    } catch {
      presentation.requiresRemoval = true
      presentation.message = "Could not remove the saved session. Try signing out again."
      finish(operation)
      return
    }
    if let token {
      do {
        try await auth.revoke(token)
      } catch {
        guard operation == generation else { return }
        presentation.message = "Signed out on this phone. Server sign-out could not be confirmed."
      }
    }
    finish(operation)
  }

  private func checkAccount(_ candidate: StoredSession, operation: Int) async throws {
    let accountID = try await api.currentAccount(accessToken: candidate.accessToken)
    guard operation == generation else { return }
    presentation.accountID = accountID
  }

  private func failed(_ error: Error, operation: Int) async {
    guard operation == generation else { return }
    presentation.accountID = nil
    if case SessionFailure.unauthenticated = error {
      session = nil
      presentation.hasSession = false
      provider.signOut()
      do {
        try store.remove()
        presentation.message = "Your session ended. Sign in again."
      } catch {
        presentation.requiresRemoval = true
        presentation.message = "Could not remove the saved session. Try signing out again."
      }
    } else {
      presentation.message = "Could not check your account. Try again."
    }
  }

  private func finish(_ operation: Int) {
    guard operation == generation else { return }
    presentation.busy = false
    changed()
  }

  private func changed() { onChange?() }
}
