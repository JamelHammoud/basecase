import CoreTransferable
import Foundation
import RoomPlan
import UniformTypeIdentifiers

enum RoomFile {
    static func json(_ room: CapturedRoom, start: RobotStart) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        return try encoder.encode(Shared(room: room, basecase: Basecase(start)))
    }

    private struct Basecase: Encodable {
        let start: [Double]
        let heading: Double

        init(_ robot: RobotStart) {
            start = [robot.position.x, robot.position.y, robot.position.z].map { (Double($0) * 1000).rounded() / 1000 }
            heading = (Double(robot.heading) * 1e6).rounded() / 1e6
        }
    }

    private struct Shared: Encodable {
        let room: CapturedRoom
        let basecase: Basecase

        enum Keys: String, CodingKey {
            case basecase
        }

        func encode(to encoder: any Encoder) throws {
            try room.encode(to: encoder)
            var container = encoder.container(keyedBy: Keys.self)
            try container.encode(basecase, forKey: .basecase)
        }
    }
}

struct SharedRoom: Transferable {
    let room: CapturedRoom
    let start: RobotStart

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { shared in
            let url = URL.temporaryDirectory.appending(path: "Room.json")
            try RoomFile.json(shared.room, start: shared.start).write(to: url, options: .atomic)

            return SentTransferredFile(url)
        }
    }
}
