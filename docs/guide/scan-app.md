# Scan app

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8m. Scan app

Basecase Scan (`ios/`) is an iPhone app that scans a room with Apple's RoomPlan, marks where the robot stands and shares the room as a file the desktop opens as a Case world (§8h, Rooms). It's SwiftUI for iOS 17 and later, with no dependencies beyond Apple's frameworks, in one Xcode project (`ios/BasecaseScan.xcodeproj`) whose folders are synchronized groups: a Swift file added to `ios/BasecaseScan/` or `ios/BasecaseScanTests/` is in its target with no project edit.

- **Scan** (`ContentView.swift`, `RoomScanner.swift`, `ScanView.swift`): **Scan** starts a `RoomCaptureView` session, which shows RoomPlan's own coaching. **Done** stops it; RoomPlan processes the room and presents it (`captureView(didPresent:)`), and the app moves to the plan. A failed scan goes back to **Scan**. On a device without LiDAR (`RoomCaptureSession.isSupported` is false, the simulator included) **Scan** is disabled and nothing else shows.
- **Stand** (`StandView.swift`, `PlanCanvas.swift`, `FloorPlan.swift`, `PlanFit.swift`): the room as a top-down plan, looking down RoomPlan's y axis, so screen right is +x and screen down is +z. Walls are lines, doors and openings gaps in them, windows grey lines, furniture filled boxes, the robot a blue dot with an arrow. A tap places the robot's start; dragging from the tap sets its heading (a tap alone keeps the last heading, up the screen at first). The heading turns to the nearest quarter turn square to the walls (`FloorPlan.squared`, the same length-weighted wall angle the desktop squares the room by), so the arrow shows the way the robot will face. A tap inside a furniture box or outside the walls' bounds does nothing. The one line on the screen is “Tap where the robot stands”.
- **Share** (`RoomFile.swift`): **Share** is enabled once a start is placed, and opens the share sheet (AirDrop to a Mac, Save to Files) with `Room.json`: RoomPlan's own Codable encoding of the `CapturedRoom`, keys sorted, plus one top-level object:

  ```json
  "basecase": { "start": [-0.3, -1.2, -1.2], "heading": 1.570796 }
  ```

  `start` is metres in RoomPlan's frame, rounded to the millimetre, with y on the floor (the lowest wall bottom). `heading` is radians about +y; the robot faces (sin heading, 0, cos heading), so 0 faces +z. The room is encoded into the same encoder before `basecase` is added, so every RoomPlan field stays as RoomPlan writes it, and RoomPlan's decoder still reads the file.
- **Desktop:** the room reader honours `basecase` (§8h, Rooms); unknown fields are ignored on both sides.

### Run it

Open `ios/BasecaseScan.xcodeproj` in Xcode 16 or later, pick your team under Signing & Capabilities for the BasecaseScan target, plug in an iPhone or iPad with LiDAR (a Pro model) and press Run. The simulator runs the app, but **Scan** stays disabled there. There's no TestFlight or App Store build.

### Tests

`ios/BasecaseScanTests/RoomFileTests.swift` decodes a recorded `CapturedRoom` (`Fixtures/captured-room.json`: the desktop's fixture room from `src/cases/roomFixture.ts`, two rooms joined by a door, a window, a sofa, a table and a chair, decoded and re-encoded by RoomPlan itself), places a start, and checks that the shared file keeps every RoomPlan field and adds `basecase`, that a tap inside furniture or outside the room sets nothing, that the heading squares to the walls and that a tap maps back to the same spot. It also checks the shared file equals `e2e/fixtures/scanned-room.json`, the file the desktop's unit and e2e tests drop, so the two can't drift. After changing what the app writes, regenerate that file from the test's output.

Run them with `sh ios/test.sh`, which picks the first available iPhone simulator and runs `xcodebuild test` without signing (extra arguments pass through to `xcodebuild`).

Check's `ios` job runs the same on macOS when a pull request touches `ios/` or that fixture (§0e). RoomPlan's scanning can't run on the simulator or CI; only the plan, the start and the file are tested.
