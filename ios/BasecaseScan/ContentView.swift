import RoomPlan
import SwiftUI

struct ContentView: View {
    @State private var scanner: RoomScanner?
    @State private var room: CapturedRoom?

    var body: some View {
        if let room {
            StandView(room: room, rescan: scan)
        } else if let scanner {
            ScanView(scanner: scanner)
        } else {
            Button("Scan", action: scan)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!RoomCaptureSession.isSupported)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.studioCanvas)
        }
    }

    private func scan() {
        guard RoomCaptureSession.isSupported else { return }

        room = nil
        let next = RoomScanner { result in
            room = result
            scanner = nil
        }
        scanner = next
        next.start()
    }
}
