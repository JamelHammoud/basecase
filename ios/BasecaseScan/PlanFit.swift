import CoreGraphics
import simd

struct PlanFit {
    let origin: SIMD2<Float>
    let scale: Float
    let offset: CGPoint

    init(bounds: (min: SIMD2<Float>, max: SIMD2<Float>), in size: CGSize, inset: CGFloat = 32) {
        let span = simd_max(bounds.max - bounds.min, SIMD2(repeating: 0.01))
        let room = SIMD2(Float(max(size.width - inset * 2, 1)), Float(max(size.height - inset * 2, 1)))
        let scale = min(room.x / span.x, room.y / span.y)

        origin = bounds.min
        self.scale = scale
        offset = CGPoint(
            x: (size.width - CGFloat(span.x * scale)) / 2,
            y: (size.height - CGFloat(span.y * scale)) / 2
        )
    }

    func point(_ spot: SIMD2<Float>) -> CGPoint {
        let at = (spot - origin) * scale

        return CGPoint(x: offset.x + CGFloat(at.x), y: offset.y + CGFloat(at.y))
    }

    func spot(_ point: CGPoint) -> SIMD2<Float> {
        origin + SIMD2(Float(point.x - offset.x), Float(point.y - offset.y)) / scale
    }

    static func heading(dragged translation: CGSize) -> Float? {
        let length = hypot(translation.width, translation.height)

        return length < 24 ? nil : Float(atan2(translation.width, translation.height))
    }
}
