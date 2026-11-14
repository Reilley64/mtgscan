import Foundation
import Security

@MainActor
final class KeychainFinishViewStore: FinishViewStore {
  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "dev.reilley.mtgscan.test.native-settings.v1",
      kSecAttrAccount as String: "finish-view",
      kSecAttrSynchronizable as String: false,
    ]
  }

  func load() throws -> FinishView? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw SessionFailure.storage }
    return FinishView(rawValue: String(decoding: data, as: UTF8.self))
  }

  func save(_ view: FinishView) throws {
    let attributes: [String: Any] = [
      kSecValueData as String: Data(view.rawValue.utf8),
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
}
