import Foundation

@MainActor
final class MemoryKeychain: SessionStore {
  var value: StoredSession?
  var failLoad = false
  var failSave = false
  var failRemove = false
  func load() throws -> StoredSession? {
    if failLoad { throw SessionFailure.storage }
    return value
  }
  func save(_ session: StoredSession) throws {
    if failSave { throw SessionFailure.storage }
    value = session
  }
  func remove() throws {
    if failRemove { throw SessionFailure.storage }
    value = nil
  }
}

@MainActor
final class NativeProvider: SignInProvider {
  var cancelled = false
  func credential(for provider: Provider) async throws -> ProviderCredential? {
    if cancelled { return nil }
    return ProviderCredential(provider: provider, idToken: "native-id-token", nonce: "nonce")
  }
  func signOut() {}
}

@MainActor
final class AuthService: SessionService {
  var refreshFailure: SessionFailure?
  var revokeFailure = false
  var revokedTokens: [String] = []
  func exchange(_ credential: ProviderCredential) async throws -> StoredSession {
    StoredSession(accessToken: "access", refreshToken: "refresh", expiresAt: 2000)
  }
  func refresh(_ token: String) async throws -> StoredSession {
    if let refreshFailure { throw refreshFailure }
    return StoredSession(accessToken: "renewed", refreshToken: "rotated", expiresAt: 3000)
  }
  func revoke(_ token: String) async throws {
    revokedTokens.append(token)
    if revokeFailure { throw SessionFailure.unavailable }
  }
}

@MainActor
final class AccountService: CurrentAccountService {
  var failure: SessionFailure?
  var suspend = false
  var pending: CheckedContinuation<String, Error>?
  func currentAccount(accessToken: String) async throws -> String {
    if let failure { throw failure }
    if suspend {
      return try await withCheckedThrowingContinuation { pending = $0 }
    }
    return accessToken == "renewed" ? "account-2" : "account-1"
  }
}

@main
struct SessionTests {
  @MainActor
  static func main() async throws {
    IdleTimerTests.run()
    try await successfulReadsSurviveSameAccountRevalidation()
    try await invalidatedReadsStayRefusedAfterSigningInAgain()
    try await CollectionTests.run()
    try await runCollectionServiceTests()
    try await DeckTests.run()
    try await runDeckServiceTests()
    let keychain = MemoryKeychain()
    let controller = SessionController(
      provider: NativeProvider(), store: keychain, auth: AuthService(),
      api: AccountService(), now: { 1000 })
    await controller.signIn(.apple)
    precondition(controller.presentation.accountID == "account-1")
    precondition(keychain.value?.refreshToken == "refresh")
    await controller.signOut()
    precondition(controller.presentation.accountID == nil && keychain.value == nil)

    for selected in [Provider.apple, .google] {
      let fresh = MemoryKeychain()
      let flow = SessionController(
        provider: NativeProvider(), store: fresh, auth: AuthService(),
        api: AccountService(), now: { 1000 })
      await flow.signIn(selected)
      let restored = SessionController(
        provider: NativeProvider(), store: fresh, auth: AuthService(),
        api: AccountService(), now: { 1000 })
      await restored.resume()
      precondition(restored.presentation.accountID == "account-1")
    }

    let cancelled = NativeProvider()
    cancelled.cancelled = true
    let cancelledStore = MemoryKeychain()
    let cancellation = SessionController(
      provider: cancelled, store: cancelledStore, auth: AuthService(),
      api: AccountService())
    await cancellation.signIn(.apple)
    precondition(cancellation.presentation.message == nil && cancelledStore.value == nil)

    let savedSessions: [StoredSession?] = [
      StoredSession(accessToken: "saved", refreshToken: "saved-refresh", expiresAt: 2000), nil,
    ]
    for saved in savedSessions {
      let unreadableStore = MemoryKeychain()
      unreadableStore.value = saved
      unreadableStore.failLoad = true
      let restoration = SessionController(
        provider: NativeProvider(), store: unreadableStore, auth: AuthService(),
        api: AccountService(), now: { 1000 })
      await restoration.resume()
      precondition(
        !restoration.presentation.canSignIn,
        "A keychain-read failure must block switching unresolved accounts")
      await restoration.signIn(.google)
      precondition(unreadableStore.value?.accessToken == saved?.accessToken)
      unreadableStore.failLoad = false
      await restoration.resume()
      precondition(restoration.presentation.canSignIn == (saved == nil))
      precondition(restoration.presentation.accountID == (saved == nil ? nil : "account-1"))
      await restoration.signOut()
      precondition(restoration.presentation.canSignIn && unreadableStore.value == nil)
    }

    let expiring = MemoryKeychain()
    expiring.value = StoredSession(accessToken: "old", refreshToken: "old-refresh", expiresAt: 1050)
    let refreshed = SessionController(
      provider: NativeProvider(), store: expiring, auth: AuthService(),
      api: AccountService(), now: { 1000 })
    await refreshed.resume()
    precondition(refreshed.presentation.accountID == "account-2")
    precondition(expiring.value?.refreshToken == "rotated")
    await refreshed.signOut()
    precondition(expiring.value == nil && refreshed.presentation.accountID == nil)

    for failure in [SessionFailure.unauthenticated, .unavailable] {
      let store = MemoryKeychain()
      store.value = StoredSession(accessToken: "old", refreshToken: "old-refresh", expiresAt: 10)
      let auth = AuthService()
      auth.refreshFailure = failure
      let flow = SessionController(
        provider: NativeProvider(), store: store, auth: auth,
        api: AccountService(), now: { 1000 })
      await flow.resume()
      precondition(flow.presentation.accountID == nil)
      if case .unauthenticated = failure {
        precondition(store.value == nil)
      } else {
        precondition(store.value?.refreshToken == "old-refresh")
        precondition(
          !flow.presentation.canSignIn, "Retry or sign out before changing an unresolved account")
      }
    }

    let refusedStore = MemoryKeychain()
    let refusedAPI = AccountService()
    refusedAPI.failure = .unauthenticated
    let refused = SessionController(
      provider: NativeProvider(), store: refusedStore, auth: AuthService(),
      api: refusedAPI)
    await refused.signIn(.google)
    precondition(refusedStore.value == nil && refused.presentation.accountID == nil)

    let brokenStore = MemoryKeychain()
    let brokenAuth = AuthService()
    brokenStore.failSave = true
    let broken = SessionController(
      provider: NativeProvider(), store: brokenStore, auth: brokenAuth,
      api: AccountService())
    await broken.signIn(.apple)
    precondition(broken.presentation.accountID == nil)
    brokenStore.failSave = false
    await broken.signIn(.google)
    brokenStore.failRemove = true
    await broken.signOut()
    precondition(!broken.presentation.canSignIn && broken.presentation.requiresRemoval)
    precondition(broken.presentation.accountID == nil)
    precondition(brokenAuth.revokedTokens.isEmpty)
    brokenStore.failRemove = false
    await broken.signOut()
    precondition(brokenStore.value == nil && broken.presentation.canSignIn)
    precondition(
      brokenAuth.revokedTokens == ["access"],
      "Retrying keychain deletion must still revoke the original server session")

    let raceStore = MemoryKeychain()
    let pendingAPI = AccountService()
    pendingAPI.suspend = true
    let race = SessionController(
      provider: NativeProvider(), store: raceStore, auth: AuthService(),
      api: pendingAPI)
    let signIn = Task { await race.signIn(.apple) }
    while pendingAPI.pending == nil { await Task.yield() }
    await race.signOut()
    pendingAPI.pending?.resume(returning: "old-account")
    await signIn.value
    precondition(race.presentation.accountID == nil && raceStore.value == nil)

    let offlineStore = MemoryKeychain()
    let offlineAuth = AuthService()
    offlineAuth.revokeFailure = true
    let offline = SessionController(
      provider: NativeProvider(), store: offlineStore, auth: offlineAuth,
      api: AccountService())
    await offline.signIn(.apple)
    await offline.signOut()
    precondition(offlineStore.value == nil && offline.presentation.accountID == nil)
    precondition(
      offline.presentation.message
        == "Signed out on this phone. Server sign-out could not be confirmed.")
    try await runServiceClientTests()
    print(
      "Session unit checks passed: Apple/Google, restore, cancellation, refresh rotation, refusal, outage, storage failure, sign-out race."
    )
  }

  @MainActor
  static func successfulReadsSurviveSameAccountRevalidation() async throws {
    let session = SessionController(
      provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(),
      api: AccountService(), now: { 1000 })
    await session.signIn(.apple)
    var pending: CheckedContinuation<String, Error>?
    let read = Task {
      try await session.withAccessToken(for: "account-1") { _ in
        try await withCheckedThrowingContinuation { pending = $0 }
      }
    }
    while pending == nil { await Task.yield() }
    await session.resume()
    pending?.resume(returning: "owned-copy")
    let copy = try await read.value
    precondition(copy == "owned-copy")
    precondition(session.presentation.accountID == "account-1")
  }

  @MainActor
  static func invalidatedReadsStayRefusedAfterSigningInAgain() async throws {
    let session = SessionController(
      provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(),
      api: AccountService(), now: { 1000 })
    await session.signIn(.apple)
    var pending: CheckedContinuation<String, Error>?
    let read = Task {
      try await session.withAccessToken(for: "account-1") { _ in
        try await withCheckedThrowingContinuation { pending = $0 }
      }
    }
    while pending == nil { await Task.yield() }
    await session.signOut()
    await session.signIn(.google)
    pending?.resume(returning: "obsolete-copy")
    do {
      _ = try await read.value
      preconditionFailure("Signing in again must not restore an invalidated read")
    } catch SessionFailure.unauthenticated {
      precondition(session.presentation.accountID == "account-1")
    }
  }
}
