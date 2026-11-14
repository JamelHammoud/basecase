import RoomPlan
import XCTest
@testable import BasecaseScan

final class RoomFileTests: XCTestCase {
    private static let tap = SIMD2<Float>(-0.3, -1.2)
    private static let heading = Float.pi / 2
    private static let table = SIMD2<Float>(-1.2, -0.6)
    private static let sharedFixture = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../e2e/fixtures/scanned-room.json")
        .standardizedFileURL

    private func recorded() throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "captured-room", withExtension: "json"))

        return try Data(contentsOf: url)
    }

    private func room() throws -> CapturedRoom {
        try JSONDecoder().decode(CapturedRoom.self, from: recorded())
    }

    private func object(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func shared() throws -> Data {
        let room = try room()
        let start = try XCTUnwrap(FloorPlan(room).start(at: Self.tap, facing: Self.heading))

        return try RoomFile.json(room, start: start)
    }

    func testSharedFileKeepsEveryRoomPlanFieldAndAddsTheStart() throws {
        var file = try object(shared())
        let basecase = try XCTUnwrap(file.removeValue(forKey: "basecase") as? [String: Any])
        let roomPlan = try object(JSONEncoder().encode(room()))
        let recorded = try object(recorded())

        XCTAssertEqual(file as NSDictionary, roomPlan as NSDictionary)
        XCTAssertTrue(Set(recorded.keys).isSubset(of: file.keys))
        XCTAssertEqual(basecase["start"] as? [Double], [-0.3, -1.2, -1.2])
        XCTAssertEqual(try XCTUnwrap(basecase["heading"] as? Double), Double.pi / 2, accuracy: 1e-5)
        XCTAssertNoThrow(try JSONDecoder().decode(CapturedRoom.self, from: shared()))
    }

    func testTheSharedFileIsTheOneTheDesktopTestsDrop() throws {
        let committed = try object(Data(contentsOf: Self.sharedFixture))

        XCTAssertEqual(try object(shared()) as NSDictionary, committed as NSDictionary)
    }

    func testTheFileIsNamedAfterTheRoomTheRobotStandsIn() throws {
        XCTAssertEqual(RoomFile.name(try room(), at: Self.tap), "Living Room")
    }

    func testARoomWithNoNamedSectionIsNamedRoom() throws {
        var file = try object(recorded())
        file["sections"] = [[String: Any]]()
        let unnamed = try JSONDecoder().decode(CapturedRoom.self, from: JSONSerialization.data(withJSONObject: file))

        XCTAssertEqual(RoomFile.name(unnamed, at: Self.tap), RoomFile.fallbackName)
    }

    func testATapInsideFurnitureSetsNothing() throws {
        let plan = FloorPlan(try room())

        XCTAssertNil(plan.start(at: Self.table, facing: 0))
        XCTAssertNil(plan.start(at: Self.table + SIMD2(0.55, 0.35), facing: 0))
        XCTAssertNotNil(plan.start(at: Self.table + SIMD2(0.65, 0), facing: 0))
    }

    func testATapOutsideTheRoomSetsNothing() throws {
        XCTAssertNil(FloorPlan(try room()).start(at: SIMD2(5, 0), facing: 0))
    }

    func testTheStartStandsOnTheFloorFacingSquareToTheWalls() throws {
        let start = try XCTUnwrap(FloorPlan(try room()).start(at: Self.tap, facing: Self.heading + 0.5))

        XCTAssertEqual(start.position.y, -1.2, accuracy: 1e-5)
        XCTAssertEqual(start.heading, Self.heading, accuracy: 1e-5)
    }

    func testThePlanMapsATapBackToTheSameSpot() throws {
        let plan = FloorPlan(try room())
        let fit = PlanFit(bounds: plan.bounds, in: CGSize(width: 390, height: 600))
        let spot = fit.spot(fit.point(Self.tap))

        XCTAssertEqual(spot.x, Self.tap.x, accuracy: 1e-4)
        XCTAssertEqual(spot.y, Self.tap.y, accuracy: 1e-4)
        XCTAssertEqual(PlanFit.heading(dragged: CGSize(width: 60, height: 0)) ?? 0, Float.pi / 2, accuracy: 1e-5)
        XCTAssertNil(PlanFit.heading(dragged: CGSize(width: 3, height: 4)))
    }
}
