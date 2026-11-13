import RoomPlan
import SwiftUI

@MainActor
@Observable
final class RoomScanner {
    let view = RoomCaptureView(frame: .zero)
    private(set) var finishing = false
    @ObservationIgnored private var delegate: ScanDelegate?

    init(onResult: @escaping (CapturedRoom?) -> Void) {
        let delegate = ScanDelegate(onResult: onResult)
        self.delegate = delegate
        view.delegate = delegate
    }

    func start() {
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    func stop() {
        finishing = true
        view.captureSession.stop()
    }
}

final class ScanDelegate: NSObject, RoomCaptureViewDelegate {
    private let onResult: (CapturedRoom?) -> Void

    init(onResult: @escaping (CapturedRoom?) -> Void) {
        self.onResult = onResult
        super.init()
    }

    required init?(coder: NSCoder) {
        nil
    }

    func encode(with coder: NSCoder) {}

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
        true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        onResult(error == nil ? processedResult : nil)
    }
}
