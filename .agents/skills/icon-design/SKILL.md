---
name: icon-design
description: How to design an icon for this studio (view rail, toolbar, panels, menus) so it matches the shipped set — the 24 grid, 2px round strokes, outline/filled pairs, optical sizing — and how to preview candidates side by side before shipping. The app has no third-party icon set; use whenever the UI needs an icon the library doesn't have, or the user asks for a new or better icon.
---

# Icon design

Every icon in the app is the studio's own; there's no icon dependency (lucide-react was removed). Three places:

- **The UI library**, `src/design-system/glyphs/` (`PlusIcon`, `CloseIcon`, `MoveIcon`, `SettingsIcon`…, about 100). Generated: the drawings live in `tools/icons/library.mjs` (helpers in `tools/icons/draw.mjs`), and `npm run icons` writes the TypeScript. Never edit the generated files by hand.
- **View icons** with outline/filled pairs, `src/design-system/icons.tsx` (`PartsIcon`, `RobotsIcon`, `LibraryIcon`, `LayersIcon`, `DriveIcon`).
- **Agent-feed glyphs**, `src/design-system/toolIcons.tsx` (`ShapeIcon`, `FileIcon`, `TrainIcon`…), also used in the UI where the idea is the same (`SearchIcon`, `LookIcon` for show, `DeleteIcon` for delete, `EditIcon` for rename, `PhotoIcon`, `RunIcon` for play, `PoseIcon`).

New icons must match them and be as carefully drawn as the tab bars in X, Apple's apps or Spotify.

## 0. Do you need a new icon?

Look in the library first: `node tools/icons/sheet.mjs <scratchpad>/icons.png` renders every icon (each group big on the grid with its 16px size beside it). Reuse an icon whose idea matches (one drawing per idea: delete is `DeleteIcon` everywhere). Draw a new one when nothing says the thing clearly, or when it needs an outline/filled pair (view switchers: the rail, segmented views).

## 1. Pick the metaphor

1. **One object, one idea.** The best icons are a single silhouette: bookmark, house, bell, nut. Two objects side by side (screw + nut, books + cube) read as clutter or as letters at 18px.
2. **Use the canonical metaphor.** Check how well-made products draw the same idea: X/Twitter, Apple (SF Symbols), Spotify, Phosphor, Material Symbols, and the apps on mobbin.com. In CAD, a nut or screw means a standard-parts library (Onshape, SolidWorks Toolbox).
3. **Check for collisions** with icons already in the same view. A flat hexagon nut next to the Settings gear reads as a second gear, so Parts is drawn in perspective instead. Spines in a row read as a bar chart; a squat jar-like card stack reads as a jar.
4. **Make 3–6 candidates** across different metaphors, not 6 tweaks of one. Show the user the sheet and let them pick. Their eye beats your rubric: in this repo the user picked the bookmark for Library over five book and stack designs.

## 2. Grid and stroke

- `viewBox="0 0 24 24"`, `stroke-width 2`, `stroke-linecap/linejoin round`, `fill none`. Rendered at **18px** in the rail (1.5px stroke) and **16px** in the agent feed (1.33px stroke). Never smaller than 16px. Design for the smallest size it ships at: §4b.
- **Live area x/y 2–22.** Rounded or angled shapes may overshoot by about 0.25 to look the same size (see §4).
- **Clearance:** at least 1.5 units of empty space between parallel strokes (about 1px at 18px), or they fuse into a blob.
- **Corners:** radius 2.5 on frames and pages, 1.5–2 on small rects; 1–1.5 on polygon corners. Sharp polygon corners with only a round join look unfinished.
- **Perspective:** draw 3D objects in the same flattened isometric view as `LayersIcon`/`ShapeIcon`: horizontal faces squashed to about 0.5, verticals straight.
- **Snap coordinates to 0.25** where you can; compute anything derived (rounded corners, ellipses, iso faces) with `tools/icons/draw.mjs` (`rounded`, `circle`, `ellipse`, `frame`, `loopArrow`; the nut is in `scripts/geometry.mjs`) and keep two decimals.

## 3. Outline and filled states

Views that toggle (the rail, any tab-like control) use a pair, like X and Apple tab bars:

- **Idle and hover: outline.** **Active: filled.**
- The filled state has the **same silhouette** (fill plus the same 2px stroke, so the size doesn't jump). Inner detail becomes **knockouts**: a `<mask>` with black strokes of width 1.5 cuts the lines and holes out of the solid shape.
- **Knockout lines must run past the silhouette** (to y = 24, or about 40% beyond the edge point), or the cut stops one stroke-width short of the edge and reads as a dangling line.
- Mask ids come from `useId()`; never hard-code an id (every scene tab mounts its own rail).
- Simple shapes (bookmark) just set `fill="currentColor"`. Layered shapes fill the front element only (Layers fills its top sheet).

## 4. Optical size and weight

Icons in one row must look equally big and equally heavy, which isn't the same as equal bounding boxes.

- Compare the candidate **at 1×** beside its real neighbours (the sheet does this). Squint: none should look smaller, lighter or bolder.
- **Rounding removes mass.** After rounding corners, grow the shape. The Parts nut went from 16.5 to 19 units tall and overshoots the sides by 0.25. The user's first reaction to the merely rounded version was "it's visually smaller".
- Narrow shapes (bookmark, 12 wide) are fine when tall and simple; wide flat shapes should span the full 20.
- **Centre optically, not mathematically.** Bounding-box centring makes lopsided icons look off: a triangle looks low, scissors lean toward their rings, a marker with its mark line looks low-right. `node tools/icons/center.mjs` lists icons whose box or mass centre is off (a lead, not a verdict). Judge each one by eye inside a real 32px button, before and after, then add the shift to `OPTICAL` in `library.mjs` (`nudge()` moves the whole drawing). Don't shift icons whose asymmetry is the meaning (align icons, arrows, play)
- Remove detail until it reads at 1×: thread lines on a screw, spine bands on books and tiny holes all vanish or turn to mush.

## 4b. Small sizes (16px and the agent feed)

At 16px one grid unit is 0.67px. Anything that needs more than a glance at 2× is gone at 1×. The user rejected the first feed set for exactly this: "too detailed, with small openings and touching elements".

- **Every enclosed opening at least 3 units across** inside the strokes (a ring's inner radius ≥ 1.5 after the 2-unit stroke). Smaller holes close into a blob or a speck. Make the feature solid instead (a dot), or remove it.
- **Every gap between strokes at least 1.5 units**, including where a line ends near an outline (a mountain ridge near a frame's bottom edge, a neck near a head). Lines that almost touch read as touching.
- **One idea, at most 2–3 strokes of detail.** Cut decoration first: the page's folded corner, the trash can's slats, the photo's sun ring.
- **Solid dots** (a pivot, a head, a sun): a zero-length subpath with round caps, `M13.5 4.5h0` at `stroke-width` 4.5–5, in its own `<path>` (the `dots` argument of `glyph()` in `toolIcons.tsx`). Keep it at least 1.5 units clear of every other stroke, so the two translucent paths never overlap (§5).
- **Before → after** (`scripts/example-feed-candidates.mjs` has the paths):

  | Icon | Before (rejected) | After (shipped) |
  |---|---|---|
  | File | page with a folded corner and two lines: the fold's tiny triangle filled in | plain rounded page, two lines 5 apart |
  | Delete | can with a handle loop and two slats: the loop and slats merged | lid line, handle as a separate bar 1.5 above it, plain body |
  | Photo | sun as a ring r 1.75, ridge 0.5 from the bottom edge | sun as a solid dot, ridge ≥ 1.5 clear of the frame |
  | Joints | three pivot rings r 2.5 joined by links (rings closed up; then dots r 1 vanished into the lines) | an angle: two arms from one vertex with the swept arc |
  | Train | loop with a V head at the arc's end: the inner arm ran into the curve ("scrunched") | the arc ends in a short straight tail (2.25), and the head (arms 3.75 at 45°) sits on the tail, clear of the curve |

### Arrowheads

- Never end a curve directly in a head: the inner arm folds back over the curve. Run a **straight tangent tail** (about 2–2.5 units) out of the curve and put the head on it.
- Arms 3.5–4 units at 45°, symmetric about the tail. Check that the inner arm's end clears the curve by ≥ 1.5.
- Keep the whole head inside the live area: shrink the loop rather than letting the head poke past y = 2.

### Optical centering

- Center the **dominant mass** on the grid (the loop's circle at x = 12), not the bounding box. A head or tail that sticks out on one side is fine; the eye centers the big shape.
- Compare in the feed mock beside symmetric neighbours (Run, Look). The user caught a loop drawn 1 unit left of center at 16px.

## 5. Translucent colour: never double exposure

Most icons are drawn in a translucent `currentColor` (`text-white/45`, `/60`). Painted directly, every SVG element is painted separately, so **wherever two elements overlap, the overlap is brighter** (seams, bright dots at shared corners, a stroke over its own fill).

`Glyph` (`src/design-system/glyph.tsx`) rules this out for every icon: it draws the strokes, dots and fills in white into a `<mask>`, then paints one `currentColor` rect through it. Overlaps inside the mask are white on white, so the colour lands once at any opacity. Inside a glyph, `currentColor` is white and `#000` erases (knockouts, `cut`). Never draw an icon outside `Glyph`, and never paint a glyph's colour any other way.

Draw clean shapes anyway; the mask hides double paint, not sloppy geometry:

- Put the whole outline in **one `<path>`** with several subpaths. A single element's stroke is painted once, however it overlaps itself.
- Write circles and ellipses as path arcs (`circle()`, `ellipse()` in `tools/icons/draw.mjs`) so they can join that path.
- Inner lines that meet a rounded outline start and end on the corner's curve (`roundedPolygon().mids`), not on the old sharp corner, or they poke past the outline.
- A failed step turns the whole row `text-red-400/80`, icon included, through `currentColor`: never hard-code a colour in a glyph.

## 6. Preview, compare, iterate

```bash
cp .agents/skills/icon-design/scripts/example-candidates.mjs <scratchpad>/candidates.mjs
# edit: add your candidates; keep the neighbours. Fix the './geometry.mjs' import to an absolute path.
node .agents/skills/icon-design/scripts/icon-sheet.mjs <scratchpad>/candidates.mjs <scratchpad>/sheet.png
```

For single-state icons at 16px (the agent feed), use the feed sheet instead: each icon big on the grid, then a mock of the feed card with real labels at 16px / 45% white:

```bash
node .agents/skills/icon-design/scripts/feed-sheet.mjs .agents/skills/icon-design/scripts/example-feed-candidates.mjs <scratchpad>/feed.png
FEED='[["Train","Started training",""]]' PER_ROW=4 node .agents/skills/icon-design/scripts/feed-sheet.mjs <candidates.mjs> <out.png>
```

A candidates file exports `ICONS`: name → path string, or `{ d, extra }` where `extra` is raw SVG (a dots path).

The rail sheet shows each icon big on the 24 grid (outline and filled, with the 2–22 live area dashed), then in a mock rail at 2× (idle · hover · active) and at 1×. Read the PNG yourself, then send it to the user (`SendUserFile`, `display: render`). When the user asks for a change, show a **before and after** in one sheet. `'lib:<Name>'` pulls in any icon from `tools/icons/library.mjs` as a neighbour (`'lib:SettingsIcon'`).

Judge it by asking:

- Does it read as the thing at 1×, idle (45% white), with no label?
- Is it the same size and weight as its neighbours?
- Does the filled state look like the same object, just solid?
- No blobs, no dangling cuts, no letters (books read as "lb", a screw with a nut as "To").

## 7. Ship it

- View icons go in `src/design-system/icons.tsx`: a `React.FC<GlyphProps>` (`{ filled?, className? }`) inside the shared `Glyph` wrapper (24 grid, stroke attributes, `aria-hidden`, default `w-[18px] h-[18px]`). Keep path data in named constants. Comments are banned (AGENTS.md §0), so what the drawing is and any optical correction go in the table below.
- UI icons go in `tools/icons/library.mjs` under their group (`controls`, `editing`, `files`, `tools`) as a path string or a spec, then `npm run icons`. A spec is `{ d, dots?, dotSize?, dash?, cut?, cutWidth?, over?, fill? }`: `dots` is a solid-dot path (zero-length subpaths, round caps), `dash` a dashed path (the boolean icons), `cut` erases a band (`cutWidth`, 5.5 by default) and `over` draws on top of the cut (a slash through an eye), `fill` fills `d`. Name it for the idea, ending in `Icon` (`FloorIcon`, not `ArrowDownToLineIcon`).
- Every glyph takes `className`, `style` and `strokeWidth` (in grid units; the send arrow uses 2.25).
- Single-state feed glyphs go in `src/design-system/toolIcons.tsx` as `export const XIcon = glyph('<path>')` (or a spec), then map tool names to them in `src/components/agent/toolRules.ts`.
- It's exported through `src/design-system/index.ts`. Pass `filled` from the active state: `icon={<v.Icon filled={active} />}`.
- The accessible name and tooltip still come from `IconButton`'s `title` and `shortcut` (AGENTS.md §3).
- Never copy path data from another icon set. Study them, then draw your own. `LayersIcon` and `HandIcon` started from lucide paths (ISC).
- Verify in the running app (`preview_start`) in each state, and run `npm run build` and `npm run lint`.
- Add the icon to the list below and to AGENTS.md §14.

## Shipped icons

| Icon | Meaning | Drawing |
|---|---|---|
| `PartsIcon` | Parts view (real components and hardware) | Isometric hex nut, rounded 1.2, 19 tall; filled: face edges and hole knocked out. `nut(NUT_PARAMS)` in `geometry.mjs` regenerates it |
| `RobotsIcon` | Robots view (published robots to insert and pose) | A ball, r 10.25 (overshoots like the nut; circles read smaller), with two solid pill eyes looking straight ahead (3 wide, 3.75 long, 5.5 apart); filled, the holes are cut 3.8 × 4.55 because dark holes in a bright shape read smaller than bright strokes of the same size. The user picked it over a flat robot head and an isometric cube head; first the outline's 2-wide stroked eyes looked smaller than the holes, then equal-size holes looked smaller than the outline's solid eyes |
| `LibraryIcon` | Library view (saved scenes and models) | Bookmark, 12 × 18, top corners r 2.5, notch 4 deep; filled: solid |
| `ObjectsIcon` | Objects view (SimReady props to insert), inserting an object in the agent feed | A bottle, 15 wide and 20.5 tall (y 1.75–22.25), centred on x 12: cap with r 1 corners and a cap line at y 4.5, neck 5.5 wide, curved shoulders, body corners r 2.5, a label band between y 13.25 and 18.25; filled: solid with the three lines knocked out. Shipped first at 12 × 19.75, which looked too small beside the nut and the robot face; 16 wide with a shorter neck read as a milk jug. Replaced a mug whose handle pulled it off the rail's centre line; the user picked it over the mug moved left, a pot with two handles, a bucket and an apple |
| `LayersIcon` | Layers view | lucide `layers`; filled: top sheet solid |
| `DriveIcon` | Screw drive choices (Hex, Torx, Phillips, Pozidriv, Slotted) in the hardware configurator; no filled state (the cell's thumb shows the choice) | Head circle r 9.5; recess solid inside, about 60% of the head (hex r 5.4, Torx A 12.6 / B 7.8, cross 11.8 × 2.9, slot 14 × 2.6); Pozidriv adds four 1.5-stroke diagonal ribs clear of the cross corners. First drawn at 45% of the head, which read as dots at 20px |
| `SettingsIcon` | Settings (opens a sheet, so no filled state) | 8-tooth gear: roots r 7.4 at ±17°, tips r 9.75 at ±9°, corners r 0.9; hole r 3.25 (`gear()` in `library.mjs`) |
| `PlusIcon`, `ComposeIcon`, `ArrowUpIcon` | Composer: Attach, New chat, Send (the user picked this set over a paperclip, a bubble with a plus and a paper plane) | Plus 16 long (lucide's is 14, too light beside the compose square). Compose: frame r 3 open at the top right, pencil as a pill 5 wide (opening 3) with a 3.75 cone, tip at (8.75, 15.25); lucide's 3-wide pencil closed up at 16px. Send arrow: 16 tall, head arms 6.5 at 45°, drawn at 18px with stroke 2.25 inside the 32px white circle |
| `MarkerIcon` | Annotate | 45° highlighter, one outline 21.25 long and 8 wide (chisel tip from 2.5 to 3.5 wide, no separate tip piece), a cap line, a mark under it. The first one spanned 16.5 and looked too small; a boxed-off tip left a 1-unit opening |
| `PoseIcon` (feed and UI) / `WalkIcon` | Pose: rest pose, saved poses, posing / walk cycle, retargeting | Arms open: solid head, arms meeting the torso exactly where it starts (no stub above the junction), legs from the hip. Walk: a striding figure with bent knees and elbows. Footprints was removed |
| `UnionIcon`, `SubtractIcon`, `IntersectIcon` | Booleans | Squares 12 × 12 overlapping by 6. The result is solid, what's removed is dashed (2.25 / 2.75), and dashes stop 1.5 clear of the solid outline |
| `RotateIcon` / `RotateRightIcon` / `RotateLeftIcon` | Rotate tool / rotate 90° / reset | Loop r 7.75 centered at y 13.25 (so the head stays inside the live area), tail 2.25, head arms 3.75 (`loopArrow()` in `draw.mjs`). The tool adds a solid center dot. An orbit ellipse read as an eye |
| `HistoryIcon` | Reopen closed scene | Clock r 8.75 with hands, the loop running counter-clockwise from 9 o'clock to a head at the upper left (tail 2) |
| `PasteIcon` | Paste | Clipboard 16 × 19.5 with its clip, an arrow down into it (9 long). A clipboard behind a page made no sense to the user |
| `FileImportIcon`, `FolderImportIcon` | Import SVG / BVH, import a robot folder | A square (18, r 3) or the folder, with an arrow down inside it. An arrow up out of the page read as export; an arrow entering from the side through a cut outline looked messy |
| `SparklesIcon` | Open Agent, subdivide | One 4-point sparkle, r 10, concave sides (control points 12% of r from the center). The user didn't want a second small star |
| `PenIcon` | Sketch | Fountain-pen nib at 45° (the user liked it diagonal, like the marker and brush): curved sides, a slit from the tip that runs into the solid breather hole (it must touch, not stop short), a separate holder bar above. Scaled 1.15× (spans about 20) because at first it looked smaller than the marker beside it |
| `EraserIcon` | Clear marks, clear sketch | Block 18 × 10 at 45°, clipped flat by the floor at y 21, which runs on to x 21; split 40% from the tip |
| `DrawingIcon` | "From the drawing" badge (14px) | A part (17 × 9.5, r 2.5) with a dimension line above it between two extension bars. A set square, a sheet with a title block (read as an ID card) and a diameter arrow (read as resize) were rejected |
| `PrinterIcon` | Settings → Printers, Export → 3MF Plates, print commands | A print head over a part: hotend 11 × 6 (r 2), nozzle cone to a tip at y 12.5, then a half-printed top layer (x 4–12, ending under the nozzle) above a full one (4–20). The head stays on x 12; the leftward mass of the half layer is the meaning, so it isn't nudged. Replaced a boxed printer (frame, gantry, print) that read as a floppy disk at 16px; the user picked it over boxed, open-gantry, paper-printer and print-on-bed versions |
| `RulerIcon` | Measure | Horizontal ruler 20 × 12, r 2.5, four ticks alternating 4 / 2.5. The 10-tall version looked too small |
| `BrushIcon` | Sculpt | 45° paintbrush: a tapered tuft (curved sides, tip flicked 1.5 to one side), a ferrule, and an outlined handle tapering to a rounded end that starts exactly at the ferrule. A one-line handle was rejected, and so was a 0.5 gap between ferrule and handle |
| `EyedropperIcon` | Eyedropper in the colour picker | 45°: glass tube 5 wide with a tapered tip, a collar bar 10 wide, a bulb 7 wide that starts at the collar. A 0.25 gap between collar and bulb was rejected |
| `ShapeIcon` | Agent feed: designing and blocking out parts | Isometric cube, squash 0.55, corners r 1.4, inner Y from the corner mids |
| `EditIcon` | Agent feed: adjusting and mirroring parts | Pencil at 45°, body 6.2 wide, one band 5 below the end |
| `DeleteIcon` | Agent feed: removing parts | Lid line, handle as a separate bar 3.5 above, plain tapered body (§4b) |
| `CodeIcon` | Agent feed: reading part code | `<` `/` `>`: chevrons 5.5 deep, slash from (13.75, 3.75) to (10.25, 20.25) |
| `LookIcon` | Agent feed: looking at the model | Almond eye 19.5 wide, pupil ring r 3.25 |
| `CompareIcon` | Agent feed: comparing with a reference | Rounded frame split down the middle |
| `CheckIcon` | Agent feed: model, printability and design checks | Four scan corners r 3 around a tick |
| `SearchIcon` | Agent feed: part, web and robot searches | Magnifier ring r 7.75, handle to (21.25, 21.25) |
| `WebIcon` | Agent feed: reading a page | Globe r 10, one meridian rx 4.25, equator |
| `FileIcon` | Agent feed: files, scene, parts list, build | Plain rounded page 15 × 19, two lines (§4b) |
| `PhotoIcon` | Agent feed: finding and viewing photos | Rounded frame, solid sun dot, ridge clear of the frame (§4b) |
| `JointsIcon` | Agent feed: joint layouts and rigs | Angle: arms from (3.5, 20.5), swept arc r 8.5. The user rejected a 3-pivot chain |
| `PoseIcon` | Agent feed: posing and retargeting | Stick figure mid-stride, solid head (stroke 5), neck 1.4 clear of it |
| `RunIcon` | Agent feed: simulating and animating | Play triangle, corners r 2 |
| `TrainIcon` | Agent feed: training policies | Clockwise loop r 7.75 centered on x 12 (optical), straight tail 2.25, head arms 3.75 at 45° (§4b) |
| `ToolIcon` | Agent feed: any other tool, subagents | Prompt: chevron and underscore |
| `ThoughtIcon` | Agent feed: Thought / Thinking rows | Light bulb: arc r 6.5, neck at 17.5, base bar |
