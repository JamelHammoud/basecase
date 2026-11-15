# src/components/visionLabels/

The shared camera-frame label editor and frame import sheet. Read [Cameras](../../../docs/guide/cameras.md) (§8l), [Cases](../../../docs/guide/cases.md) (§8h), [Menus and shortcuts](../../../docs/guide/menus-and-shortcuts.md) (§11), [Copy](../../../docs/guide/copy.md) (§3), [Visual system](../../../docs/guide/visual-system.md) (§4) and [Design system](../../../docs/guide/design-system.md) (§14) before changing this area.

Geometry conversion runs in the label edit worker. Editor history shares frame image and depth buffers. Event callbacks apply immutable edit operations to the latest history, including when focus changes publish another edit before React renders again. Render reads only React state. Async results apply only while the originating editor is open, and each editor runs one async edit at a time. New drawings receive a new instance id even when the selection changes, while handle edits retain the selected instance and its keypoints. The parent host saves changes and remounts the editor after external label changes. The root [AGENTS.md](../../../AGENTS.md) applies here too.

Tool buttons and tool shortcuts clear unfinished drawings before changing tools. Enter on a focused button keeps the button's native activation, while Enter on the canvas finishes a polygon.

Handle edits retain the selected label's class, even after adding a different class for the next drawing.

Every change callback carries the current set and its exact predecessor from document history, including undo, redo and class creation. Hosts use that predecessor to preserve concurrent changes when saving.
