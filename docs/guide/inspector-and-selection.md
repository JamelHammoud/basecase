# Inspector, selection, drag and drop, mode panels

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 7. Inspector (Figma UI3 style)

- Sections are separated by full-width hairline dividers, never boxed cards. Section titles are sentence case and 13px semibold.
- **Notes** (`NotesSection`) is one section for the scene and for a part: a text area with no placeholder, collapsed while empty and open when it has text. `Section` reads `defaultOpen` only on mount, so `InspectTab` keys the Inspector by `sceneId` and `PartInspector` keys Notes by part id: loading a scene into the open tab or picking another part opens Notes again when they hold text.
- Every Inspect view and mode panel scrolls with `useScrollFade`, like Parts: an edge fades only while there's more to scroll past it.
- **No selection:** Notes for the scene (saved with it to `ai-reference/`) and Comments (just the title and + when there are none). Scene stats live in Layers: the header shows parts and cutouts, and a footer shows the overall size.
- **Part selected:**
  - Inline-renamable name, then Duplicate / Save to Library / Delete.
  - Hardware shows the same `HardwareConfigurator` sections as Parts (type tiles, drive, size, length, finish) in place of Size and Shape. Specs and Holes come before Notes, collapsed; Holes carries + (Add clearance hole) in its header. Length typing and scrubbing are live; release commits one undo step. The color follows the finish unless it was set by hand.
  - No Solid · Cutout · Guide control: the part type is set from the right-click menu (one part or several).
  - Size W/H/D (+ wall T), Position X/Y/Z (Floor, Stack and Center actions), Rotation X/Y/Z with 90° steps.
  - **Shape** (Round, Taper, Bend, Twist): collapsible, open only when non-zero.
  - Collapsible sections keep their title where a plain section's sits and put the chevron at the far right, after any header actions.
  - Appearance (`ColorField` + material), comments on this part, Notes (sent to the agent), then Product (maker · part number, specs, mounting, model source, links) for real components.
- **Several parts selected (`MultiInspector`), like a multi-selection in Figma:**
  - Title: the group name (renamed in place, one undo step on Enter or blur), or “N parts”. Under it, the part count and the selection's overall size (`39 × 50 × 39 mm`). Group/Ungroup, Duplicate, Save to Library and Delete sit beside it.
  - **Align:** one icon strip per axis (min · center · max) with Spread beside it (`AlignBar`; Spread needs 3+ parts).
  - **Position:** X/Y/Z of the selection's bounds center. Typing, scrubbing and math move every unlocked part together (`handleMoveSelection` takes an absolute target computed from the latest parts, so Enter + blur can't move it twice). Drop to floor and Center on origin in the header.
  - **Rotate:** X / Y / Z 90° turns the selection as one piece about its center (`handleRotateSelection`).
  - **Combine:** Union / Subtract / Intersect on one strip; Subtract's tooltip names the part it keeps.
  - **Appearance:** `ColorField` and material, each showing “Mixed” when the parts differ.
  - Strips (`StripGroup` + `StripButton` in `AlignBar.tsx`) are the pattern for a row of equal actions: a 32px soft track with 2px inset cells, never a grid of text buttons or tall tiles.
- **`NumberInput`:**
  - Drag the label to scrub (Shift ×10, ⌥ ×0.1). ↑/↓ steps, Enter commits, Esc reverts.
  - Accepts math (`40/2`).
- **Live vs. committed edits:** scrubbing, slider drags and typing call `onChange(value, live=true)`. Those skip undo history until release or blur, which commits one undo step (`commitParts(updater, live)` in `App.tsx`).

## 7a. Selection, Groups & Booleans

- **Selection is an ordered list** (`selectedIds` in `App.tsx`). The first id is the primary, and Subtract keeps that part.
- **Canvas:**
  - Click a part to select it, or its whole group. Clicking again keeps the group selected.
  - Double-click or ⌘-click a grouped part to drill into just that part. Once inside a group (some but not all of its members selected), a single click selects another member.
  - Shift-click works like Figma (`clickSelection` in `workspace/selection.ts`): it toggles what a plain click would pick. From outside a group it adds or removes the whole group; inside one it adds or removes just that member, so members of one group and other groups mix freely. ⇧⌘-click toggles exactly the part under the pointer. Clicking empty space clears the selection.
  - Shift-drag draws a blue selection box and adds every unlocked, visible part it touches, plus their groups. Hit testing uses each part’s real silhouette (projected vertices + a 7×7 ray grid), not its bounding box. It runs in the capture phase and turns OrbitControls off for that drag, so Shift-drag never pans. Shift-scroll still pans.
  - Only primary clicks change selection; right-click never does.
  - Locked parts ignore clicks, like Figma: a click or double-click passes through to the part behind (`raycastUnlocked` in `three/viewport/picking.ts`), and right-click opens the canvas menu, not the part's. ⌘-click (and ⇧⌘-click) still selects a locked part, as does its row in Layers. Measure, Annotate and Mark still land on them.
- **Layers:**
  - A plain click selects that row; Shift/⌘-click toggles exactly that row (a part row never expands to its group; a group row toggles all its members).
  - Group rows are collapsible, double-click to rename, and select every member.
- **Moving several parts:** the gizmo attaches to a pivot at the selection’s center. Move, rotate and scale apply to every unlocked part and commit as one undo step.
- **Groups:** stored on each part as `group: { id, name }`, so they’re undoable and saved with the scene. Groups are flat (no nesting). ⌘G groups, ⇧⌘G ungroups.
- **Booleans:**
  - With 2+ parts, Union, Subtract (from the primary) and Intersect replace them with one mesh (`combinedPart`). When every operand can be built exactly (`exactSolid`), the result keeps its recipe in `csg` (the operation, the operands as they were placed, its position and size then), which STEP export rebuilds. Sculpting it drops the recipe; resizing it makes export use the mesh.
  - With one part, Subtract uses every visible Cutout that overlaps it.
- **Selection bar:** with 2+ parts selected, a glass pill above the toolbar shows the count, Union, Subtract, Intersect and Group/Ungroup.
- **Align (`AlignBar`):**
  - One icon strip per axis: X Left·Center·Right, Y Bottom·Middle·Top, Z Back·Center·Front, with Spread beside each (disabled under 3 parts). The right-click Align submenu and the multi-selection Inspector show the same strip; a click in the submenu closes the menu.
  - Several parts align to their shared bounds; one part aligns to the origin (Bottom = floor).
  - Bounds include each part's rotation (`halfExtents` in `utils/selection.ts`, checked against three.js `Box3`), so align, spread, drop to floor and the sizes in Layers and the Inspector stay right for rotated parts.
  - Tooltips say where a part goes: Align left for several parts, Left to origin (Bottom to floor) for one.
  - ⌘K has Align Left, Right, Top, Bottom, Front, Back and Center (X), and Spread Along X, Y and Z.
- **Drop to Floor (F):** loose parts each drop to the floor; when every selected part is grouped, the selection lands as one piece.

## 7a-2. Drag and Drop

- **Draggable onto the canvas:** Parts tiles, Shapes menu tiles, Library model tiles, Robots tiles and SimReady tiles (Objects and Robots). They use `PART_DRAG_TYPE` / `MODEL_DRAG_TYPE` / `ROBOT_DRAG_TYPE` (`{ url, name }`, imported on drop) / `SIMREADY_DRAG_TYPE` (`{ url, name, maker, license }`) from `src/data/dnd.ts`, and the tile’s preview is the drag image.
- **Where it lands:** at the drop point, snapped to the grid step. Dropping on a part stacks it on that surface; otherwise it sits on the floor.
- **Shapes menu:** fades out (stays mounted) while dragging, then closes on drag end. Removing the drag source would cancel the drag.
- **Image files** dropped on the canvas become reference images (§7b).
- **Mesh files** (STL, 3MF, OBJ, PLY, FBX, GLB / glTF, DAE) dropped on the canvas, picked with File ▸ Import Mesh, ⌘K or the canvas menu (at the clicked point) are inserted as one `mesh` part each, standing on the drop point (`workspace/meshImport.ts`). Units and axes follow each format's convention: STL, 3MF and PLY are millimetres with Z up; OBJ millimetres with Y up; GLB, glTF and DAE metres; FBX centimetres times its unit scale. A model under 1 mm across is read as metres. Meshes are welded, never simplified, so prints keep every triangle. `mesh.file` marks an imported mesh, and only those print (`isPrinted`); robot links and SimReady meshes don't. Parsing runs in the geometry worker except 3MF and DAE, which need `DOMParser`. FBX textures are skipped (`NoTextures`), since the worker has no `document`.
- **CAD files** (STEP, STP, IGES, IGS) take the same import path on desktop: drop, Import Mesh, ⌘K or the canvas menu. They never parse in the renderer or in Node: `platformBridge.openCadFile` hands the bytes to the main process (`cad:open`, or `/cad-open` over the dev bridge), which sends them to the same sandboxed converter as `import_maker_cad` (§8a, §0h) in its bodies mode. OpenCascade reads the units from the file header, so every body arrives in millimetres at true size, Y up. Each body becomes its own `mesh` part (`workspace/cadImport.ts`), named from the file's product names (else “⟨file⟩ 2”), coloured with the face colour covering most of it, and grouped under the file name when there's more than one; the whole file stands on the drop point. The converter simplifies a file past 200,000 triangles in total and refuses one with more than 1,000 bodies. A file it can't read gets the same single “Couldn’t import ⟨file⟩” toast as a broken mesh. The web demo keeps meshes only (`IS_WEB_DEMO`).
- **STEP export** goes the other way: Export ▸ STEP in the title bar, or Export STEP in ⌘K, writes `⟨scene⟩.step` for Fusion, Onshape, SolidWorks and other CAD tools (`workspace/useStepExport.ts`, desktop only, `IS_WEB_DEMO`). It takes the parts STL takes (visible solids, no reference images, `isStepBody`) as they're modelled, never as posed; with none of those in the scene the menu item is disabled and the ⌘K command is hidden. `stepJob` (`workspace/stepExport.ts`) loads catalog meshes, then gives each part one body named after it, with its colour, placed at its position and rotation in millimetres, Z up like STL, inside a sub-assembly named after its group. A replicad part goes as its code, a basic shape as an exact solid (`exactSolid`, `workspace/stepSolids.ts`: box, cube, cylinder, tube and torus always; sphere, cone, capsule and dome when round, and a dome or capsule only when its ends are at least as tall as they are wide, since OpenCascade's reader loses the curved face of a revolved arc of a wide ellipse), and a Union, Subtract or Intersect result as the boolean of its operands while it keeps the size it was made at; everything else (catalog parts, hardware, imports, OpenSCAD, sculpted and deformed parts, wedges, pyramids and hex prisms, whose flat faces the kernel merges back, and a replicad part resized unevenly) goes as its mesh, which the kernel turns into a faceted solid. Code and booleans also carry their mesh, used if the exact build fails. The kernel builds the file in its sandbox (`platformBridge.exportStep`, `cad:export-step` or `/cad-export-step`; §9, §0h). “Exporting STEP…” shows while it runs (a second click meanwhile does nothing) and goes away on a clean export; “Exported STEP without ⟨n⟩ parts” replaces it when a part had no geometry or failed both ways, and a failed export shows the kernel's error (on desktop without Electron's “Error invoking remote method” prefix, stripped by `ipcMessage`). If no part ends up with geometry, the progress toast just closes.
- **Scene files** (`.basecase`) dropped on the canvas open in a new tab (§5a). While files are dragged, the overlay reads “Drop to add a reference image” for images alone, “Drop to import” otherwise.

## 7b. Reference Images

- **Adding:** ⌘V anywhere outside a text field, drop image files on the canvas (at the drop point), ⌘K → “Add Reference Image”, or right-click the canvas → “Add Reference Image”.
- **What they are:**
  - An `image_plane` part with `imageDataUrl` and role `reference`.
  - Unlit, double-sided, with a thin frame that turns blue when selected.
  - Never printed, exported to STL or used in booleans. Listed in the brief as reference photos, not parts.
- **Size:** photos are downscaled to 2048px max (`utils/imageFile.ts`). They start upright with a 120mm long side. Width and height stay locked to the photo’s aspect ratio.
- **Hide all:** the image toggle in the Layers header (shown when the scene has photos), ⇧I, or ⌘K. It’s a view setting, not undoable; hidden photos dim in Layers and aren’t rendered or clickable.
- **Inspector:** an Image section with preview, Opacity, and Stand Up / Lay Flat (backdrop vs. blueprint on the floor), with no tooltips on those two. The header is the name row alone: the Image section already says it's a photo, so there's no caption that it isn't printed. Notes describe what to take from the photo. The Layers row shows the photo as its glyph.

## 8. Mode Panels (Sculpt, Sketch, Import SVG)

There's no Shape tab. These panels appear in place of the Inspector only while they apply (`SculptAndDrawStudio`), with the title and a Done button in their own header.

- **Sculpt:** shown while the Sculpt tool (C) is on. The tool is experimental and hidden unless enabled in Settings; when it's off, C, the toolbar button, the ⌘K entry and the Shortcuts row are all gone, and turning it off mid-sculpt switches back to Move. Existing sculpted parts still render and export. Brushes, Size/Strength sliders, Mirror X/Z, Subdivide, Add clay presets. Done switches back to Move.
- **Sketch:** opened from Shapes ▾ → Sketch, ⌘K or right-click. Extrude / Revolve, Points / Freehand / Hole tools, snap, undo point, clear, then Output fields.
- **Import SVG:** opened from Shapes ▾, ⌘K, right-click or the Library. Drop zone, samples, paste code, preview, then Output fields. “Edit in Sketch”, beside the preview, hands the outline to Sketch.
- Adding a part from Sketch or SVG closes the panel and shows the new part in the Inspector.
- Both end in one Add button. To keep the result, use Save to Library on the new part (the bookmark in its Inspector header, or right-click); the model it saves inserts that same part again.
- Combine lives in the selection bar, the right-click menu and the multi-selection Inspector.
