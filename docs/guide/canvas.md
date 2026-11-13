# 3D canvas

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 12. 3D Canvas

- Background `#1b1b1b` (the canvas card) with a soft CSS vignette.
- **Lighting:** a `RoomEnvironment` environment map (intensity 0.5, like the Parts thumbnails), a hemisphere light, the shadow-casting key light, a cool rim light, and a soft fill that follows the camera. Dark plastic reads through its reflections, so don't remove the environment map.
  - Near-black part colors render no darker than HSL lightness 0.13 (about `#212121`; `displayColor` in `three/buildPartMesh.ts`). Maker CAD often paints black plastic `#020202` (the STS3215), which no light can show.
- **Stationary camera views** (§8l) draw as small frustums (`three/viewport/cameraGlyphs.ts`) on `stage.overlays`, so captures never show them; `currentView` and `lookThrough` on the handle read and set the framing.
- **Infinite grid** (`three/infiniteGrid.ts`): a camera-following shader plane on y = 0, not a fixed `GridHelper`.
  - 1 / 10 / 100 / 1000 mm lines fade in and out by on-screen density, so there's no moiré when zoomed out or at grazing angles.
  - The red X and blue Z axes run forever, and the grid fades into the distance (the fade distance scales with zoom).
  - `toneMapped: false` keeps line contrast exact; lines sit about 15–25 levels above the background, and the axes are brighter.
- Edges: Figma blue `#0d99ff` for selection, red `#ef4444` for cutouts.
- **Selection outline** (`three/viewport/selectionOutline.ts`): selected parts also get a 2.5px Figma-blue outline around their combined silhouette, drawn over everything (so a part inside a shell still shows), and around a multi-selection or group as one shape. Before each render the selected meshes are drawn into a 4× MSAA single-channel mask (camera layer 7, override material), then a quad in `stage.overlays` (so captures never show it), covering only the selection's screen rectangle, dilates the mask. Nothing is rebuilt; with no selection the pass is skipped.
- Catalog components (manufacturer meshes) and hardware (fasteners) draw their edge lines only when selected or set as a cutout. Unselected, their dense feature edges showed through enclosing shells as dark specks; the judge read those as overlapping geometry.
- B-rep edges are drawn only at creases (over 20° between the faces on each side). Smooth seams from lofts, splines and tangent fillets aren't outlined, so lofted shells don't get contour stripes.
- The directional light's shadow `normalBias` scales with the shadow frustum (about 1.5 shadow-map texels), so large robots don't get shadow-acne specks.
- Solid part faces use a small polygon offset, so edge lines always draw cleanly on top. Without it, outlines lying on another surface (a flush panel, a coincident face) flicker as dark speckles.
- Gestures: two-finger orbit (or pan), Space-drag pan, pinch zoom, gizmo drag.
- **Cursors** (`CURSORS` in `src/design-system/cursors.ts`, Figma-style): the canvas has its own arrow (near-black, white 1.5px stroke, every corner rounded, soft shadow), the same shape as the blue `AgentCursor`, so the two read as a pair. Comment mode shows a bubble in the pin's shape and the arrow's colors; its tip corner is where the pin's corner lands. Sculpt shows an outlined crosshair. Space-pan keeps the system grab hands.
  - They're CSS cursors drawn by the OS (never a DOM element following the pointer), so they never lag. Each is a 32 × 32 px SVG shipped at 2x in `image-set()` for Retina, with its hotspot on the exact pixel the tip shows (the arrow's stroke tip at (3, 3)).
  - The canvas element inherits its wrapper's cursor (`.canvas-cursor > canvas` in `index.css`), because three.js controls write `cursor: auto` onto the canvas. Comment pins use the arrow too.
- **Zoom range** 25 mm – 12 m camera distance (`MIN_DIST` / `MAX_DIST` in `three/viewport/types.ts`), enough for humanoids.
  - The far plane is 80 m, and the near plane scales with distance.
  - Grid fade, shadow plane and the directional light's shadow frustum all follow the camera distance.
- **The camera can go under the floor** to inspect undersides: orbit (drag and two-finger scroll) is limited only near the poles (`MIN_POLAR` / `MAX_POLAR` in `three/viewport/types.ts`). From below, the grid draws at 60% strength (it never writes depth, so parts on the floor show through it without z-fighting), and the shadow plane faces up, so it's culled and never hides parts.
- **Port snapping** (`three/viewport/portSnap.ts`, logic in `agent/snap.ts`, §9): moving one part with the gizmo, or dropping a Parts or Library tile, snaps it onto another part by their mounting ports, the way the agent's `mate` places parts.
  - While the drag lasts, ports that have a compatible partner nearby show as dots (`portDots.ts`, a `THREE.Points` overlay in `stage.overlays`, so captures never show them): on the dragged part and on parts within 60 mm or the part's own size. The pair about to snap turns Figma blue.
  - A dragged port within the snap distance of a compatible port snaps: the part takes the pose `planMate` gives that pair, live, under the pointer. The snap distance is 8 mm (`SNAP_MM`) out to 400 mm of camera distance and grows with it beyond, so it stays about the same on screen.
  - Releasing commits the pose and the mate (`PartMate`, the newest one replacing the part's older mates) as one undo step (`onPlacePart` → `placePart`). Dragging a mated part without a snap drops its mates.
  - Holding ⌘ (Ctrl on Windows; `runtime.freeHeld`) moves freely; pressing or letting go mid-drag re-solves at once. Grid snapping still applies; Shift turns that off as before.
  - Ports come from part data (`portsAt`), never meshes. The target parts' world ports are gathered once when the drag starts and the dots update only on pointer moves while dragging. Snapping is off while the robot is posed, for multi-part selections and groups (the pivot), and in Rotate and Scale.
- **Shift while using the gizmo** turns off grid, angle and scale snapping for smooth motion. A “Snapping off” glass chip shows while dragging. Commits keep 0.1 mm / 0.1° precision instead of rounding to 0.5 mm / 1°. Shift-dragging a gizmo handle never starts a box select (`transformControls.axis` check).
