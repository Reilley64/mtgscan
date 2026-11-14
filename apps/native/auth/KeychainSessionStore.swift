import Foundation
import Security

@MainActor
final class KeychainSessionStore: SessionStore {
  private let service = "dev.reilley.mtgscan.test.native-session.v1"
  private let account = "supabase"

  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrSynchronizable as String: false,
    ]
  }

  func load() throws -> StoredSession? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw SessionFailure.storage
    }
    return try JSONDecoder().decode(StoredSession.self, from: data)
  }

  func save(_ session: StoredSession) throws {
    let data = try JSONEncoder().encode(session)
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      let item = query.merging(attributes) { _, new in new }
      guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
        throw SessionFailure.storage
      }
    } else if status != errSecSuccess {
      throw SessionFailure.storage
    }
  }

  func remove() throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw SessionFailure.storage
    }
  }
}
