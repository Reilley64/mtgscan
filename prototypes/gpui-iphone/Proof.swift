import AVFoundation
import UIKit

@_silgen_name("mtgscan_gate_event")
func gateEvent(_ kind: Int32)

@MainActor private var proof: ProofView?

@_cdecl("mtgscan_proof_attach")
@MainActor func attachProof(_ pointer: UnsafeMutableRawPointer) {
  let host = Unmanaged<UIView>.fromOpaque(pointer).takeUnretainedValue()
  let view = ProofView(host: host)
  proof = view
  host.addSubview(view)
  host.accessibilityElements = [view, view.cameraAction]
}

@_cdecl("mtgscan_proof_sync")
@MainActor func syncProof(_ running: Int32, _ label: UnsafePointer<CChar>) {
  proof?.sync(running: running != 0, label: String(cString: label))
}

@_cdecl("mtgscan_proof_bounds")
@MainActor func proofBounds(_ x: Double, _ y: Double, _ width: Double, _ height: Double) {
  proof?.position(cameraFrame: CGRect(x: x, y: y, width: width, height: height))
}

@_cdecl("mtgscan_proof_text_size")
@MainActor func proofTextSize() -> Double {
  UIFont.preferredFont(forTextStyle: .body).pointSize
}

@MainActor private final class CameraAction: UIAccessibilityElement {
  override func accessibilityActivate() -> Bool {
    gateEvent(1)
    return true
  }
}

@MainActor private final class Preview: UIView {
  override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
  var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

@MainActor private final class ProofView: UIScrollView, UITextFieldDelegate {
  private weak var host: UIView?
  let cameraAction: CameraAction
  private let stack = UIStackView()
  private let preview = Preview()
  private let capture = UIButton(type: .system)
  private let recognition = UILabel()
  private let field = UITextField()
  private let network = UIButton(type: .system)
  private let networkStatus = UILabel()
  private var outline: [SIMD2<Double>]?
  private var running = false
  private var capturing = false
  private lazy var camera = CameraSession { [weak self] sample in
    DispatchQueue.main.async { self?.sample(sample) }
  }

  init(host: UIView) {
    self.host = host
    cameraAction = CameraAction(accessibilityContainer: host)
    super.init(frame: .zero)
    cameraAction.accessibilityTraits = .button
    cameraAction.accessibilityValue = "Stopped"
    backgroundColor = UIColor(red: 16 / 255, green: 22 / 255, blue: 34 / 255, alpha: 1)
    alwaysBounceVertical = true
    keyboardDismissMode = .interactive
    stack.axis = .vertical
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor, constant: 12),
      stack.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor, constant: -12),
      stack.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor, constant: -16),
      stack.widthAnchor.constraint(equalTo: frameLayoutGuide.widthAnchor, constant: -32),
    ])
    let heading = label("GPUI camera proof", style: .title2)
    heading.accessibilityTraits = .header
    preview.isAccessibilityElement = true
    preview.accessibilityLabel = "Camera preview"
    preview.accessibilityValue = "Stopped"
    preview.previewLayer.session = camera.session
    preview.previewLayer.videoGravity = .resizeAspectFill
    preview.heightAnchor.constraint(equalToConstant: 180).isActive = true
    configure(capture, title: "Recognize card", action: #selector(takePhoto))
    capture.isEnabled = false
    configure(recognition, text: "No recognition yet")
    field.borderStyle = .roundedRect
    field.attributedPlaceholder = NSAttributedString(
      string: "Proof note", attributes: [.foregroundColor: UIColor.lightGray])
    field.accessibilityLabel = "Proof note"
    field.font = .preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    field.returnKeyType = .done
    field.delegate = self
    field.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    configure(network, title: "Check test session", action: #selector(checkSession))
    configure(networkStatus, text: "No authenticated request yet")
    [heading, preview, capture, recognition, field, network, networkStatus].forEach(
      stack.addArrangedSubview)
    accessibilityElements = [heading, preview, capture, recognition, field, network, networkStatus]
    NotificationCenter.default.addObserver(
      self, selector: #selector(background), name: UIApplication.willResignActiveNotification,
      object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification,
      object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(textSizeChanged), name: UIContentSizeCategory.didChangeNotification,
      object: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  func position(cameraFrame: CGRect) {
    guard let host else { return }
    let top = host.safeAreaInsets.top
    frame = CGRect(
      x: 0, y: top, width: host.bounds.width, height: max(0, cameraFrame.minY - top - 8))
    cameraAction.accessibilityFrameInContainerSpace = cameraFrame
  }

  func sync(running: Bool, label: String) {
    let changed = self.running != running
    self.running = running
    cameraAction.accessibilityLabel = label
    if changed {
      cameraAction.accessibilityValue = running ? "Starting" : "Stopped"
      if running { startCamera() } else { camera.setRunning(false) }
      preview.accessibilityValue = running ? "No card detected" : "Stopped"
    }
    capture.isEnabled = running && outline != nil && !capturing
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    textField.resignFirstResponder()
    return true
  }

  private func startCamera() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: camera.setRunning(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
        DispatchQueue.main.async {
          guard let self else { return }
          if allowed && self.running { self.camera.setRunning(true) }
          if !allowed {
            self.preview.accessibilityValue = "Camera permission denied"
            self.cameraAction.accessibilityValue = "Permission denied"
          }
        }
      }
    default:
      preview.accessibilityValue = "Camera permission denied"
      cameraAction.accessibilityValue = "Permission denied"
    }
  }

  private func sample(_ sample: DetectionSample) {
    guard running else { return }
    outline = sample.corners
    cameraAction.accessibilityValue = sample.failure == nil ? "Running" : "Camera failed"
    preview.accessibilityValue =
      sample.failure == nil
      ? (sample.detected ? "Card detected" : "No card detected") : "Camera failed"
    capture.isEnabled = outline != nil && !capturing
    if let connection = preview.previewLayer.connection,
      connection.isVideoRotationAngleSupported(90)
    {
      connection.videoRotationAngle = 90
    }
  }

  @objc private func takePhoto() {
    guard let outline, running, !capturing else { return }
    capturing = true
    capture.isEnabled = false
    recognition.text = "Recognizing card"
    camera.takePhoto(outline: outline) { [weak self] result in
      let message: String
      switch result {
      case .failure(let failure): message = "Photo failed: \(failure.rawValue)"
      case .success(let photo):
        defer { try? FileManager.default.removeItem(at: photo.url) }
        do {
          let gallery = try Gallery(directory: GalleryDownloads.installedDirectory)
          let recognition = try CardRecognizer.recognize(
            photo: photo.url,
            outline: CardOutline(corners: photo.outline.map { CGPoint(x: $0.x, y: $0.y) }),
            gallery: gallery,
            trainingCropDirectory: FileManager.default.urls(
              for: .cachesDirectory, in: .userDomainMask)[0]
              .appendingPathComponent("training-crops", isDirectory: true)
          )
          switch recognition {
          case .notACard: message = "Not a card"
          case .card(let card):
            let name = card.candidates.first?.name ?? "No card printing"
            message = card.decision.accepted ? "Accepted: \(name)" : "Abstained: \(name)"
          }
        } catch { message = "Recognition unavailable. Check the test app gallery." }
      }
      DispatchQueue.main.async {
        guard let self else { return }
        self.capturing = false
        self.capture.isEnabled = self.running && self.outline != nil
        self.recognition.text = message
        UIAccessibility.post(notification: .announcement, argument: message)
      }
    }
  }

  @objc private func checkSession() {
    network.isEnabled = false
    Task {
      defer { network.isEnabled = true }
      let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("gpui-proof-session.json")
      let message: String
      do {
        let data = try Data(contentsOf: file)
        try FileManager.default.removeItem(at: file)
        let session = try JSONDecoder().decode(ProofSession.self, from: data)
        guard let url = URL(string: session.url), url.scheme == "https",
          url.host?.hasSuffix(".supabase.co") == true
        else {
          throw URLError(.badURL)
        }
        var request = URLRequest(url: url.appendingPathComponent("auth/v1/user"))
        request.setValue(session.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let (reply, response) = try await URLSession(configuration: .ephemeral).data(for: request)
        let user = try JSONDecoder().decode(ProofUser.self, from: reply)
        message =
          (response as? HTTPURLResponse)?.statusCode == 200
            && user.email == "test-user@mtgscan.test"
          ? "Authenticated test user. Request succeeded." : "Test session refused"
      } catch { message = "Test session unavailable. Provision a fresh test session." }
      networkStatus.text = message
      UIAccessibility.post(notification: .announcement, argument: message)
    }
  }

  @objc private func background() {
    camera.setRunning(false)
    gateEvent(2)
  }

  @objc private func foreground() { gateEvent(3) }
  @objc private func textSizeChanged() { gateEvent(4) }

  private func label(_ text: String, style: UIFont.TextStyle) -> UILabel {
    let label = UILabel()
    configure(label, text: text)
    label.font = .preferredFont(forTextStyle: style)
    return label
  }

  private func configure(_ label: UILabel, text: String) {
    label.text = text
    label.textColor = .white
    label.font = .preferredFont(forTextStyle: .body)
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
  }

  private func configure(_ button: UIButton, title: String, action: Selector) {
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .preferredFont(forTextStyle: .body)
    button.titleLabel?.adjustsFontForContentSizeCategory = true
    button.titleLabel?.numberOfLines = 0
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    button.addTarget(self, action: action, for: .touchUpInside)
  }
}

private struct ProofSession: Decodable {
  let url: String
  let publishableKey: String
  let accessToken: String
}

private struct ProofUser: Decodable {
  let email: String
}
