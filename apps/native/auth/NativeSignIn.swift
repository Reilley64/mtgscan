import AuthenticationServices
import CryptoKit
import GoogleSignIn
import Security
import UIKit

@MainActor
final class NativeSignIn: NSObject, SignInProvider, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  weak var presenter: UIViewController?
  private var continuation: CheckedContinuation<ProviderCredential?, Error>?
  private var nonce: String?
  private var authorization: ASAuthorizationController?

  init(config: PublicConfiguration, presenter: UIViewController?) {
    self.presenter = presenter
    super.init()
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(
      clientID: config.googleIOSClientID, serverClientID: config.googleServerClientID)
  }

  func credential(for provider: Provider) async throws -> ProviderCredential? {
    switch provider {
    case .apple:
      return try await apple()
    case .google:
      guard let presenter else { throw SessionFailure.configuration }
      do {
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let token = result.user.idToken?.tokenString else {
          throw SessionFailure.unauthenticated
        }
        return ProviderCredential(provider: .google, idToken: token, nonce: nil)
      } catch {
        let failure = error as NSError
        if failure.domain == kGIDSignInErrorDomain && failure.code == -5 { return nil }
        throw error
      }
    }
  }

  private func apple() async throws -> ProviderCredential? {
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw SessionFailure.unavailable
    }
    let rawNonce = Data(bytes).base64EncodedString()
    nonce = rawNonce
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.email]
    request.nonce = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }
      .joined()
    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      let controller = ASAuthorizationController(authorizationRequests: [request])
      authorization = controller
      controller.delegate = self
      controller.presentationContextProvider = self
      controller.performRequests()
    }
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    presenter!.view.window!
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let data = credential.identityToken, let token = String(data: data, encoding: .utf8),
      let nonce
    else {
      complete(.failure(SessionFailure.unauthenticated))
      return
    }
    complete(.success(ProviderCredential(provider: .apple, idToken: token, nonce: nonce)))
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithError error: Error
  ) {
    if (error as? ASAuthorizationError)?.code == .canceled {
      complete(.success(nil))
    } else {
      complete(.failure(error))
    }
  }

  private func complete(_ result: Result<ProviderCredential?, Error>) {
    let pending = continuation
    continuation = nil
    nonce = nil
    authorization = nil
    pending?.resume(with: result)
  }

  func signOut() {
    GIDSignIn.sharedInstance.signOut()
  }
}
