# Annotations

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 10. Annotations (comments in 3D)

- **Comment tool (M):**
  - Click a part or the floor to drop a pin.
  - Pins attached to a part follow it (`partId` + `offset`).
  - Pins are Figma-style speech-bubble markers, numbered by creation. On hover they expand to preview the first comment.
- **Thread card (glass):** header `#n on Part`, then Resolve, Delete thread, Close. Each comment shows its time (and “Edited”) over its text, with no author: every comment is the person's own. Comments can be edited or deleted from hover actions; a thread's only comment has no Delete of its own, since Delete thread does that job. Reply composer at the bottom, with the same round Post button (↩︎) as the agent composer's Send.
- **Deleting** a thread or a comment asks first in a `ConfirmDialog` (“Delete thread #2?” with its comment count, or “Delete comment?” quoting it), then toasts “Deleted comment” with Undo, which puts a comment back in its place. Clicking a toast keeps the thread card open.
- **Persistence:** resolved threads are hidden on the canvas but still listed in Inspect → Comments. Annotations save with the scene and appear in `DESIGN_BRIEF.md` (§4) and `design-spec.json`.
