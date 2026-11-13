import RoomPlan
import SwiftUI

struct StandView: View {
    let room: CapturedRoom
    let rescan: () -> Void
    @State private var start: RobotStart?
    @State private var heading: Float

    init(room: CapturedRoom, start: RobotStart? = nil, rescan: @escaping () -> Void) {
        self.room = room
        self.rescan = rescan
        _start = State(initialValue: start)
        _heading = State(initialValue: start?.heading ?? .pi)
    }

    var body: some View {
        let plan = FloorPlan(room)

        VStack(spacing: 16) {
            Text("Tap where the robot stands")
                .font(.headline)
                .foregroundStyle(.secondary)
                .padding(.top, 16)
            GeometryReader { geometry in
                let fit = PlanFit(bounds: plan.bounds, in: geometry.size)

                PlanCanvas(plan: plan, fit: fit, start: start)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0).onEnded { drag in
                            place(plan: plan, at: fit.spot(drag.startLocation), dragged: drag.translation)
                        }
                    )
            }
            HStack(spacing: 12) {
                Button("Scan", action: rescan)
                    .buttonStyle(.bordered)
                if let start {
                    ShareLink(item: SharedRoom(room: room, start: start), preview: SharePreview("Room")) {
                        Text("Share")
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Share") {}
                        .buttonStyle(.borderedProminent)
                        .disabled(true)
                }
            }
            .controlSize(.large)
            .padding(.bottom, 16)
        }
        .background(Color.studioCanvas)
    }

    private func place(plan: FloorPlan, at spot: SIMD2<Float>, dragged: CGSize) {
        let facing = PlanFit.heading(dragged: dragged) ?? heading

        guard let placed = plan.start(at: spot, facing: facing) else { return }

        heading = placed.heading
        start = placed
    }
}
