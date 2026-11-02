# Annotations

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 10. Annotations (comments in 3D)

- **Comment tool (M):**
  - Click a part or the floor to drop a pin.
  - Pins attached to a part follow it (`partId` + `offset`).
  - Pins are Figma-style speech-bubble markers, numbered by creation. On hover they expand to preview the first comment.
- **Thread card (glass):** header `#n on Part`, then Resolve, Delete thread, Close. Comments can be edited (marked “edited”) or deleted. Reply composer at the bottom.
- **Deleting** a thread or a comment asks first in a `ConfirmDialog` (“Delete thread #2?” with its comment count, or “Delete comment?” quoting it). Deleting a thread still toasts with Undo.
- **Persistence:** resolved threads are hidden on the canvas but still listed in Inspect → Comments. Annotations save with the scene and appear in `DESIGN_BRIEF.md` (§4) and `design-spec.json`.
