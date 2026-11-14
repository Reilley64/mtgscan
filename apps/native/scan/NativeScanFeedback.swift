import AVFoundation
import Security
import UIKit

@MainActor
final class NativeScanFeedback {
  private var players: [ScanFeedback: AVAudioPlayer] = [:]

  func play(_ outcome: ScanFeedback) {
    if outcome == .recognized {
      UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    } else {
      UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
    guard soundsEnabled() else { return }
    try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
    let name = outcome == .recognized ? "scan-recognized" : "scan-failed"
    if players[outcome] == nil, let url = Bundle.main.url(forResource: name, withExtension: "wav") {
      players[outcome] = try? AVAudioPlayer(contentsOf: url)
    }
    players[outcome]?.currentTime = 0
    players[outcome]?.play()
  }

  private func soundsEnabled() -> Bool {
    let key = Data("scan-sounds".utf8)
    for service in ["app:no-auth", "app"] {
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service, kSecAttrAccount as String: key,
        kSecAttrGeneric as String: key, kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var value: CFTypeRef?
      let status = SecItemCopyMatching(query as CFDictionary, &value)
      if status == errSecSuccess, let data = value as? Data {
        return String(data: data, encoding: .utf8) != "off"
      }
      if status != errSecItemNotFound { return false }
    }
    return true
  }
}
