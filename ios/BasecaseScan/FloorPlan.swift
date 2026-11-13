import RoomPlan
import simd

struct PlanBox: Equatable {
    enum Kind: Equatable {
        case wall, door, window, opening, furniture
    }

    let kind: Kind
    let center: SIMD2<Float>
    let size: SIMD2<Float>
    let yaw: Float

    init(_ kind: Kind, dimensions: simd_float3, transform: simd_float4x4) {
        self.kind = kind
        center = SIMD2(transform.columns.3.x, transform.columns.3.z)
        size = SIMD2(dimensions.x, dimensions.z)
        yaw = atan2(-transform.columns.0.z, transform.columns.0.x)
    }

    var axis: SIMD2<Float> { SIMD2(cos(yaw), -sin(yaw)) }

    var normal: SIMD2<Float> { SIMD2(sin(yaw), cos(yaw)) }

    var ends: (SIMD2<Float>, SIMD2<Float>) {
        (center - axis * size.x / 2, center + axis * size.x / 2)
    }

    var corners: [SIMD2<Float>] {
        let along = axis * size.x / 2
        let across = normal * size.y / 2

        return [center - along - across, center + along - across, center + along + across, center - along + across]
    }

    func contains(_ point: SIMD2<Float>) -> Bool {
        let offset = point - center

        return abs(simd_dot(offset, axis)) <= size.x / 2 && abs(simd_dot(offset, normal)) <= size.y / 2
    }
}

struct RobotStart: Equatable {
    let position: SIMD3<Float>
    let heading: Float

    var spot: SIMD2<Float> { SIMD2(position.x, position.z) }

    var facing: SIMD2<Float> { SIMD2(sin(heading), cos(heading)) }
}

struct FloorPlan {
    let boxes: [PlanBox]
    let floorHeight: Float
    let wallYaw: Float
    let bounds: (min: SIMD2<Float>, max: SIMD2<Float>)

    init(_ room: CapturedRoom) {
        let walls = room.walls.map { PlanBox(.wall, dimensions: $0.dimensions, transform: $0.transform) }
        let furniture = room.objects.map { PlanBox(.furniture, dimensions: $0.dimensions, transform: $0.transform) }
        let holes = [(room.doors, PlanBox.Kind.door), (room.windows, .window), (room.openings, .opening)]
            .flatMap { surfaces, kind in surfaces.map { PlanBox(kind, dimensions: $0.dimensions, transform: $0.transform) } }
        let heights = (room.walls.isEmpty ? room.objects.map { ($0.transform, $0.dimensions) } : room.walls.map { ($0.transform, $0.dimensions) })
            .map { transform, dimensions in transform.columns.3.y - dimensions.y / 2 }
        let outline = (walls.isEmpty ? furniture : walls).flatMap(\.corners)

        boxes = walls + holes + furniture
        floorHeight = heights.min() ?? 0
        wallYaw = FloorPlan.dominantYaw(walls.isEmpty ? furniture : walls)
        bounds = (
            outline.reduce(SIMD2(repeating: .infinity)) { simd_min($0, $1) },
            outline.reduce(SIMD2(repeating: -.infinity)) { simd_max($0, $1) }
        )
    }

    var furniture: [PlanBox] { boxes.filter { $0.kind == .furniture } }

    func start(at spot: SIMD2<Float>, facing heading: Float) -> RobotStart? {
        let inside = all(spot .>= bounds.min) && all(spot .<= bounds.max)

        guard inside, !furniture.contains(where: { $0.contains(spot) }) else { return nil }

        return RobotStart(position: SIMD3(spot.x, floorHeight, spot.y), heading: squared(heading))
    }

    func squared(_ heading: Float) -> Float {
        let quarter = Float.pi / 2
        let turned = wallYaw + ((heading - wallYaw) / quarter).rounded() * quarter

        return atan2(sin(turned), cos(turned))
    }

    private static func dominantYaw(_ boxes: [PlanBox]) -> Float {
        let sum = boxes.reduce(SIMD2<Float>.zero) { $0 + $1.size.x * SIMD2(cos(4 * $1.yaw), sin(4 * $1.yaw)) }

        return simd_length(sum) < 1e-9 ? 0 : atan2(sum.y, sum.x) / 4
    }
}
