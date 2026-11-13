import RoomPlan
import SwiftUI

struct ScanView: View {
    let scanner: RoomScanner

    var body: some View {
        CaptureView(view: scanner.view)
            .ignoresSafeArea()
            .overlay(alignment: .bottom) {
                if !scanner.finishing {
                    Button("Done", action: scanner.stop)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .padding(.bottom, 24)
                }
            }
    }
}

private struct CaptureView: UIViewRepresentable {
    let view: RoomCaptureView

    func makeUIView(context: Context) -> RoomCaptureView {
        view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
