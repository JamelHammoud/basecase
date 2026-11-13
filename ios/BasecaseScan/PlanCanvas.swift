import SwiftUI

struct PlanCanvas: View {
    let plan: FloorPlan
    let fit: PlanFit
    let start: RobotStart?

    var body: some View {
        Canvas { context, _ in
            for box in plan.boxes {
                draw(box, in: &context)
            }
            if let start {
                drawRobot(start, in: &context)
            }
        }
    }

    private func draw(_ box: PlanBox, in context: inout GraphicsContext) {
        switch box.kind {
        case .furniture:
            context.fill(outline(box.corners), with: .color(.studioFurniture))
        case .wall:
            context.stroke(line(box), with: .color(.studioWall), style: StrokeStyle(lineWidth: 4, lineCap: .square))
        case .window:
            context.stroke(line(box), with: .color(.studioWindow), lineWidth: 4)
        case .door, .opening:
            context.stroke(line(box), with: .color(.studioCanvas), lineWidth: 6)
        }
    }

    private func drawRobot(_ start: RobotStart, in context: inout GraphicsContext) {
        let at = fit.point(start.spot)
        let ahead = CGPoint(x: at.x + CGFloat(start.facing.x) * 28, y: at.y + CGFloat(start.facing.y) * 28)
        var arrow = Path()

        arrow.move(to: at)
        arrow.addLine(to: ahead)
        context.stroke(arrow, with: .color(.studioAccent), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        context.fill(Path(ellipseIn: CGRect(x: at.x - 10, y: at.y - 10, width: 20, height: 20)), with: .color(.studioAccent))
    }

    private func line(_ box: PlanBox) -> Path {
        var path = Path()

        path.move(to: fit.point(box.ends.0))
        path.addLine(to: fit.point(box.ends.1))

        return path
    }

    private func outline(_ corners: [SIMD2<Float>]) -> Path {
        var path = Path()

        path.addLines(corners.map(fit.point))
        path.closeSubpath()

        return path
    }
}
