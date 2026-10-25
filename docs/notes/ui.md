# UI notes (renderer: components, design system, App, SceneWorkspace)

Knowledge preserved from code comments before they were removed. AGENTS.md covers the rest.

## App (tab host)

- `MAX_TABS = 8`: every open scene stays mounted with its own WebGL canvas and agent session, and browsers cap WebGL contexts near 16, so tabs stop well short.
- `CLOSED_LIMIT = 10` closed scenes can be reopened with ⇧⌘T.
- `FIRST_TAB = 'main'`: agent callers with no workspace id (bench, parts generator) talk to this tab.
- Tab ids are new per tab, but the first tab's scene id is the fixed `my-robotics-design`; other scenes get `newSceneId()`.
- `blankSeed` numbers new scenes against open tabs and the tabs being closed in the same action, so a replacement for the last tab never reuses a name.
- Sidebar toggle position: 8px after the stoplights' bounding box (x 19–79). Without stoplights (browser, full screen) it centers on the rail column (x = 26, so `26 - 14`).
- Scene events carry their tab's `workspaceId`. Requests without one (dev tools) go to the scene in front. A request for a closed tab is answered with an error so the MCP call doesn't hang.
- Old saved scenes with robots imported before imports captured the maker's data (masses, centres of mass, limits) are upgraded from their descriptions at startup, one at a time, and saved back in place with `keepUpdatedAt`.
  - The save sends no thumbnail: the backend would copy it over `ai-reference/preview.png`.
- `captureFront` stores a preview frame of the scene in front before it goes to the back, because a paused viewport can't be read cheaply later. `refreshPreview` renders on demand for a background tab.
- Closing the last tab leaves a blank one. Its Undo removes it again only if it's still untouched.
- When the tab in front closes, its right neighbour comes forward, or the left one at the end.
- After a close or reopen, the newly active scene mounts its handle one render later, so the follow-up call runs in a `setTimeout`.
- Duplicate copies the scene, not the agent conversation, which stays with the original.
- Tab keys (⌘T, ⌘W, ⌃Tab…) work while typing. ⌘9 is always the last tab, like a browser.

## SceneWorkspace

### Lifecycle and host handle

- `aliveRef` goes false when the tab closes, so a run that finishes later never starts a queued message in a closed scene.
- The dev `__studio` hook (bench harness) always points at the scene in front. It exposes `sceneRecord`, `meshByColor` (solid triangles in the world frame, grouped by color, for the parts pipeline), `importRobot`, `robotPreview` (used by `tools/robots/previews.mjs`) and `load`.
- `hostRef` holds the latest closures while the handle object given to App stays stable, so App never re-registers.
- The memo comparator lets a background scene skip app-wide changes. Its own state still renders, and it catches up when it comes to the front.
- Joint ids: scenes saved before robots got unique joint ids are renumbered on open (`normalizeProject`).
- `copyName` produces “Sprout copy”, then “Sprout copy 2”… so library names stay unique.
- `pristine` in `WorkspaceMeta` means untitled, empty and never used: only then can opening a library scene reuse the tab.

### Undo history

- A `Snapshot` holds parts, joints and the pose. Joints belong to their parts: deleting parts deletes their joints, and undo brings both back.
- `live` edits (scrub, drag, typing) update the scene without history. `base` is the snapshot taken when the live edit began, and the next committed edit records one step back to it.
- `restoreJointsRef` and `restorePoseRef` put joints and pose back without recording a step. `restorePoseRef` is set after `usePosing` exists, hence the ref.
- Pose edits less than 700 ms apart fold into the step that started them (`lastPoseEditRef`).
- The upgrade of old imported robots also rewrites the undo history (`docRef`), so undoing never brings back a robot without its data. `upgradeMissingRef` remembers robots whose source wasn't found, so they aren't retried until restart.
- `partsRef` / `projectRef` / `docRef` exist so async agent work and double commits (Enter, then blur) read the latest state, not a stale closure.

### Selection

- `handleSelect`: a plain click on the canvas selects the part's whole group. The double-click `drill` selects just that part. Once inside a group, a plain click on another member selects that member. In Layers a plain click always targets the row itself.
- The Pose tool selects just the part. Clicking another robot selects all of it first; a click on the already selected robot picks a joint.
- Select All skips hidden parts and hidden reference photos.

### Context menu and clipboard (platform quirks)

- `TRACKPAD_TAP_GRACE_MS = 400`: a two-finger tap at the start or end of a trackpad scroll, or one that stops momentum, registers as a secondary click. A right-click within 400 ms of the last canvas wheel event is ignored. `lastWheelRef` records it.
- `menuPressRef` tracks a secondary press. On macOS `contextmenu` fires on press, so the menu waits for the release and opens only if the pointer barely moved. On Windows and Linux it fires after release, so the release records whether the press moved. A keyboard-triggered menu has no press.
- `lastKeyEditRef`: ⌘Z / ⌘A run from the keyboard record their time, so the native Edit menu doesn't repeat the same key. Undo, Redo and Select All stay registered with Electron so text fields keep native editing.
- The module-level `partsClipboard` is shared by every tab. The system clipboard holds only `application/x-basecase-parts` as a marker, so ⌘V pastes parts only while nothing newer was copied.
  - A cut, or a paste into another scene, lands in place first. Repeats step by 15 mm (`inPlace` set and `pastes` map).
- ⌘K's Copy and Cut run `execCommand` while the palette still has focus, so `copyViaCommand` sets `forceCopyRef` to let the copy handler act despite the focused field. Text fields and open sheets otherwise keep native editing (`skip`).

### Agent

- The Claude vision input is 1568px on the long edge. Larger only costs time, so uploads are downscaled to it.
- `agentBusyRef` mirrors `isAcpBusy` synchronously. Without it, a message sent in the gap before React re-renders would start a second run instead of steering the first.
- Messages the agent couldn't take at once go to `queuedPromptsRef` and run in order when the run ends. Stop drops them too (marked “Not sent”).
- A reopened conversation sets `pendingResumeRef`, and the next prompt resumes the ACP session first.
- A conversation lives in one scene: `studio.focusChat` shows the tab that already has it.
- `TRANSCRIPT_UPDATES`: only thought, message, tool call, tool call update and plan updates create a reply. Session metadata (commands, modes, usage) must not show as an empty reply.
- A finished run saves the conversation. A scene in the background reports “done” through `notify`.
- `agentQueueRef` serializes agent ops so parts appear one by one with the cursor leading. Each op waits 260 ms (add) or 160 ms (other) for the cursor to arrive, then 30 ms for React to commit so the next op reads fresh parts.
- One undo step per tool call: all ops but the last are `live`, the last commits.
- `agentFollowRef` keeps the camera following the agent until the user moves the view.
- Joint definitions from the agent take pivot and axis from the servo's real output (`servoOutput`) unless given.
- Setting a pose with a name already used on the same robot replaces the saved one.

### Robots and parts

- Imported robot joints get unique ids against the scene's existing ones (a second robot from the same maker would clash).
- Every import from a link renders its preview only after the robot is in the scene, so a window in the background never holds the import up.
- A dropped robot stands where it landed. Otherwise it goes beside what's in the scene (the import centres it on the origin). A drop already put it where the user is looking, so only the non-drop path sets `frameNextRef`.
- A catalog hand with a published description goes in as the articulated model. If the download fails, the fixed catalog mesh goes in instead.
- Hardware parts are named by spec (“M3 × 10 Socket Head Screw”), so duplicates are normal. Changing hardware size or length keeps the part's bottom in place. The color follows the finish unless it was set by hand (compared to `hardwareColor` of the old spec).
- Dropping a catalog item uses `at = [x, surfaceY, z]`. Hardware drag payloads are `hardware:type|size|length`.
- Library saves keep each part whole (`node.part`). Inserting a model saved from a scene recreates real parts under the model's name. Older saves come back as blocks, with a toast saying CAD shapes weren't saved.
- `resaveScene` (rename, duplicate, delete-undo) sends no thumbnail: the backend copies it to `ai-reference/preview.png`, which must keep showing the scene saved last. Library thumbnails render from the parts instead.
- Renaming a scene that is open in a tab renames the tab too, so its next save keeps the name.
- A boolean with several parts uses the first as the base. With one part, Subtract uses every visible Cutout that overlaps it.
- `handleMoveSelection` takes an absolute target computed from the latest parts, so Enter then blur can't move the selection twice.
- Drop to Floor: when every selected part is grouped, the selection lands as one piece instead of each part falling flat.
- ⌘F opens Parts and then retries a few frames to focus the search, because the field mounts with the Parts view.
- Simulate tab shows only while the scene has joints. Leaving the Pose tab (or closing the panel) returns the tool to Move. Turning the Sculpt setting off leaves the tool.

### Layout

- The title bar actions are centered on y = 23 (not 22) and end in line with the inspector card's content (8 + 12 px).
- Inspector aside width includes the 8px gap before the card, so collapsing closes the gap, and the resizer sits in it. `PanelTabs` is given `panelWidths.right - 16`, the card less its 8px padding.
- The rail's open view collapses the sidebar like an activity bar; any other opens it.
- Canvas card: a near-transparent white ring overlay (`z-10`, `pointer-events-none`) separates it from the chrome. The active scene tab opens into the canvas's top edge.
- Dropped catalog payloads that aren't ours (other drag types) are ignored.

## AcpStudioPanel (agent panel)

- `MAX_IMAGES = 20` images go inline with a message. More images and other files go as evidence.
- The picker can be opened from elsewhere (Library → From Image…) by incrementing `attachRequest`. The component compares to the last value so it doesn't open on mount.
- Attached images keep the order they were picked in (`Promise.all` over the inline set).
- Follow-the-bottom (`stickRef`):
  - Scrolling a nested scroller (code blocks, `data-inner-scroll`) doesn't count until it reaches its top.
  - Back within 4px of the bottom resumes following.
  - Dragging the overlay scrollbar (`data-scrollbar-drag`) unsticks it.
  - Content also grows on its own (thoughts expanding, images loading), so the follow runs on content size changes, not only on new messages.
- `COLLAPSED_PX = 212` is about 9 lines for a long user message.
- Old saved chats have no `segments`: they're rebuilt in a simple order (thoughts, text, tools).
- A live thought already says “Thinking” in its own header, so the status line is hidden when the last segment is a thought.
- `ThoughtBlock` keeps `override = null` until the user toggles it (open while live, folded once done). A layout effect keeps the live window on the newest line.
- `toolLabel` returns `null` to hide a step. A URL parse failure falls back to the raw text.
- `SHIMMER_TEXT` (transparent text with a gradient clipped to it) goes on the title alone, never around children with `opacity`: Chromium paints those in their own layer, the gradient never reaches them, and their text turns invisible while still taking space. A running step's detail did this and left blank lines in the feed.
- `CyclingPlaceholder`: each example ends by fading out, and that animation end advances the index. `key={exampleSet}` restarts from the first example when the set changes. Under reduced motion there is no animation and no cycling.

## AgentCursor

- Follows a 3D point, projected each frame, so it stays glued to the part while orbiting.
- Easing is `cur += (target - cur) * 0.16` per frame: quick start, soft landing.

## Annotations

- Pins update by direct style writes every frame (no React re-render).
- Shown pins: open threads plus the active one even if resolved.
- The thread card focuses its input after `requestAnimationFrame`, so it's positioned first.

## BuildPanel

- `purchaseCache` is module-level: purchase records are app-wide, so every Build tab shares one copy.
- Mesh measurements are taken after the viewport renders the new parts and settle before measuring.
- Run Checks sets its state, then runs the sweep in a `setTimeout`, so the button shows its state before the sweep blocks the thread.
- A budget caption is hidden when the list is empty, because the $0 total already says it.
- With no printed parts the printing section is just its settings.

## HardwareConfigurator

- `FINISH_ORDER` is the same for every type, so switching the head never moves the chips.
- Type tiles render at the default length, so scrubbing the length doesn't re-render every tile.
- `StockStrip` scrolls with the trackpad or Shift-scroll and centres the current length. It jumps on first show and glides after. Its edge fades only while lengths are hidden past it.

## ImportRobotSheet

- The folder picker uses `webkitdirectory`, which isn't in React's types, hence the `@ts-expect-error`.

## Inspector

- Material values are stored (they feed the AI brief); labels are for people.
- Multi-selection position and size are the selection's bounds, like Figma.
- `wrapDegrees` wraps rotations to (−180, 180] so they read naturally.
- Image planes keep their aspect ratio: editing width or height changes the other.
- `GroupName` commits once on Enter or blur.

## LeftSidebar, LibraryPanel, PartsPanel, RobotsPanel

- Sidebar aside width includes the 8px gap after the card, like the inspector.
- Layers: an empty scene returns no Layers content at all.
- Library: a description written as “Saved from 52 parts” (what Save to Library writes) is hidden, since Parts shows it better. The hover card is suppressed while renaming so it doesn't cover the field. Thumbnails and sizes use only solid, visible parts.
- Parts search:
  - Words under 3 characters must start a word (“5” finds “Pi 5”, not “65 mm”). Longer words can sit anywhere (“3215”).
  - Size queries parse “m3x12”, “M2.5 × 8”, “m3 12mm”, “608” into size, length and leftover words. A size turns hardware hits into that exact part.
  - A hardware match uses only its own type's label, so “flat” finds countersunk screws, not every screw.
  - Group and family words (`GROUP_WORDS`, `FAMILY_WORDS`) rank a match higher (“servo” → servos first).
  - Scoped search covers hardware by type, not by spec, since a size in the query makes a new variant.
- `lastSpecByFamily` is module-level, so coming back to a family keeps the last spec.
- The hardware family default item and Parts only list real components and hardware (`inParts`).
- Robot tiles try preview sources in order, moving to the next when one fails to load: shipped `public/robots`, then the remembered import preview.

## SceneTabs

- `press` stores `dx` in a ref because pointerup can arrive before the drag state renders.
- `settling` is set on drop so tabs that don't need to slide drop their drag offset at once.
- `initialIds`: tabs present at launch don't play the grow-in animation. The class is kept on later tabs because it plays only once, on mount.
- Layout math uses offsets, which ignore transforms, so positions stay put while tabs are being dragged. A neighbour makes room once the dragged tab's leading edge crosses its middle.
- Slide animation: the new start position is applied before animating (forced layout), then it transitions to the slot.
- Edge fades are measured from layout offsets, not `scrollWidth`, which counts tabs mid-slide or mid-drag as overflow.
- While one preview card is open, neighbours swap in at once.
- Tab width is a definite `width: 180` with `flexShrink: 1` and `minWidth: 96`, not just flex-basis, so the strip sizes to full tabs and then shrinks them to fit.

## Viewport3D

- Wheel/pinch needs a non-passive listener so a pinch doesn't zoom the whole page.
- Marquee select runs in the capture phase so it can disable OrbitControls before OrbitControls sees Shift and pans.
- Hit-test for the marquee: a part counts if a sampled vertex lands in the box, or a ray through the box hits it, so round parts select by silhouette and big parts select from inside.
- Setup effect runs once, so callbacks go through `callbacksRef` and gizmo/snap state through refs. `applySnaps` reads refs only.
- Pose tool: the joint gizmo is a single-axis, local-space ring or arrow. Leaving it must reset `showX/Y/Z` and space, hence the explicit undo of that setup in `attachGizmo`.
- `withRest` runs a function with every part in the modeled pose, then restores the posed one. Measurements, interference and sweeps use it. `toRest` maps an edit made while posed back to the modeled pose.
- The sweep (`sweepClashes`) skips pairs that already clash in the modeled pose (those belong to `check_scene`), and treats the floor as an obstacle.
- `servoOutput` takes the centre of the topmost cap of the servo mesh. Catalog servos are oriented output-up.
- `partTriangles` removes position and rotation but keeps scale, so print orientations use the model's own axes.
- Review captures hide reference photos (they'd confuse comparison), add a headlight (2.4) and lift the background so dark parts show detail. Silhouette mode renders flat white on black with nothing else.
- Agent view `az:<deg>,el:<deg>` converts agent frame (front −Y, left +X, Z up) to the scene as `(x, z, −y)`.
- Hardware, components and meshes are fixed-size: the scale gizmo never resizes them (`hasFixedSize`).
- Studio lighting: a PMREM room environment so dark plastic shows shape and metal horns don't render black. A fill light just above the camera (0.55) keeps faces turned from the key from going flat black.
- Shadow `normalBias` is about 1.5 shadow-map texels (`(2 * half / mapSize) * 1.5`) so big scenes don't get acne.
- Spawn animation uses easeOutBack with `c = 1.6`: a little overshoot reads as “placed”.
- Unmount calls `renderer.forceContextLoss()` because each open tab holds a context and browsers cap them.
- Sculpting converts a part to a welded sculptable mesh on the fly on its first stroke, and removes its static CAD edge lines so they don't stay stale.
- Only a primary click (`button === 0`) changes selection; a click that misses every part falls back to the ground plane (Y = 0) for annotation pins.
- Shift held turns snapping off (`shiftHeldRef`). Free moves keep 0.1 precision; snapped moves round as before. Shift-dragging a gizmo handle (`transformControls.axis`) is never a box select.
- Simulating: the gizmo becomes a hand (`handRef`) that grabs the selection and pulls it on a spring. Scale mode has nothing to grab. Parts are never changed by the grab.

## ViewportToolbar

- While a shape is dragged out, the Shapes menu fades but stays mounted: removing the drag source cancels the drag.
- `onDragStart` is deferred one `requestAnimationFrame` so the browser captures the drag image first.

## Design system

- `Button` / `IconButton`: tooltips are custom (`Tooltip`), never native `title`.
- `ColorPicker`: tracks `lastEmitted` so the field stays in sync when the value changes from outside (undo) without re-emitting. `PICKER_WIDTH = 248`. It opens left of the field, clamped to the window. A cancelled eyedropper (`EyeDropper` promise rejection) is swallowed.
- `SearchField`: clicking padding or icon focuses the input (Back doesn't). `onMouseDown` prevents default so a click doesn't flash the focus ring.
- `HoverCard`: the 450 ms open delay is slower than a warm tooltip, so passing across a grid doesn't flash cards. While one is open, neighbours still wait 220 ms so crossing a tile toward the card's links doesn't swap it.
- `ImageViewer`:
  - Zoom keeps the point under the pointer fixed.
  - Pointer capture retargets later events to the stage, so what was pressed (`onBackdrop`) is recorded at pointerdown.
  - A plain click on the backdrop closes. A drag doesn't.
  - “Fit” follows window resizes.
- `Kbd` keeps words (“Space”, “Esc”) whole and splits modifier glyph combos into separate caps.
- `NumberInput` evaluates math with a small hand-written parser (numbers, `+ - * /`, parentheses), never `eval`.
- `OverlayScrollbars`: refs and a state setter only, so the scroll listener can keep the first closure. Thumb rects are fixed-position.
- `PanelResizer`: `COLLAPSE_SLACK = 90` px past the minimum collapses. The hit area fills the 8px gap between cards.
- `PanelTabs`:
  - `FADE_PX = 24` is also the room kept between the fade and the current tab when scrolling it into view.
  - The `ResizeObserver` reports once on observe; the first report is skipped, or it would cut the smooth scroll short.
  - The tab row has 2px padding on every side, cancelled by a negative margin, so focus rings aren't clipped.
  - Optical padding: a tab with a menu keeps 11px right padding when idle (1px more than plain tabs, so the label looks centred); with the chevron, 7px, because the glyph carries 3px of air, putting its ink 10px from the edge like the label's.
  - The menu anchors to the whole row, so it opens under the card's first tab, not the pill.
  - The chevron's column grows from zero width, so the pill widens as the chevron fades in from the left.
- `PopoverMenu`: `GAP = { top: 10, bottom: 8, left: 8, right: 8 }` is the space between trigger and menu, and between menu and window edge. Placement is measured before paint and re-run on resize, scroll and content change.
- `Section`: an empty or collapsed section renders only its header, centered between equal paddings. The title is the toggle for keyboard and screen readers; the chevron mirrors it for the pointer.
- `useScrollFade`: a callback ref (attaches whenever the element mounts, also after a panel first renders without it). State changes only when an edge flips, so scrolling doesn't re-render. Image `load` doesn't bubble, so it's listened for in the capture phase. A `ResizeObserver` also watches children, since a child that grows (a tab widening on hover) changes overflow without resizing the container.
- `cursors.ts`: cursors are 32 × 32 CSS px SVGs shipped at 2x in an `image-set` so they stay sharp on Retina. The OS draws them, so they never lag the pointer. The arrow is shared with `AgentCursor`; its tip sits so the 1.5px stroke's outer edge lands on (3, 3). Hotspots: arrow (3, 3), comment pin (3, 27), crosshair (16, 16).
- `icons.tsx`:
  - `Knockout` cuts children out through a mask for filled glyphs. The filled nut's cuts run past the silhouette (`NUT_CUTS`) so they reach its outer edge.
  - Nut: 19 tall, overshooting the sides by 0.25, because corner rounding costs visual mass.
  - Robot ball: r 10.25, overshooting the 2–22 live area, since circles read smaller than polygons of the same box.
  - Filled robot eyes are cut 3.8 × 4.55 (outline eyes are 3 × 3.75): dark holes in a bright shape read smaller than bright strokes.
  - Screw drives: head circle 9.5; recess fills about 60% of the head or it reads as a dot; hex r 5.4, Torx lobes A 12.6 / B 7.8; Pozidriv ribs are 1.5 strokes kept clear of the cross's corners so translucent idle color doesn't double up; the slot stops short of the rim.
- `theme.ts`: `cardPadding = 12` is “1px border + 11px padding” from when cards had a border; keep the total. Stoplights are 14px buttons, 23px apart, measured on macOS 27 (`lightsX: 19`), and `electron/main.mjs` `trafficLightPosition` must match.

## main.tsx

- `html.is-electron` lets the sidebar use native window vibrancy. `html.is-fullscreen` is toggled from the `window:fullscreen` events, since full screen has no desktop behind the window and the chrome must turn solid.
