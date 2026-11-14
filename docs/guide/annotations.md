# Annotations

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 10. Annotations (comments in 3D)

- **Comment tool (M):**
  - Click a part or the floor to drop a pin.
  - Pins attached to a part follow it (`partId` + `offset`).
  - Pins are Figma-style speech-bubble markers, numbered by creation. On hover they expand to preview the first comment.
- **Words:** a pin with its replies is a comment, everywhere a person reads it: ⌘K's Comment, Comment Here, Inspect ▸ Comments, the pin's “Comment 2” label, the card's Delete comment and its toasts. Code calls it a thread (`Thread`, `deleteThread`), but the UI never does, since in a robotics CAD app a thread is a screw's.
- **Thread card (glass):** header `#n on Part`, then Resolve, Delete comment, Close. Each comment shows its time (and “Edited”) over its text, with no author: every comment is the person's own. Comments can be edited or deleted from hover actions; a card's only comment has no Delete of its own, since Delete comment in the header does that job. Reply composer at the bottom, with the same round Post button (↩) as the agent composer's Send.
- **Deleting** asks first in a `ConfirmDialog`. The header's Delete comment asks “Delete comment #2?”, saying “Deletes its replies.” when it has any and quoting it otherwise; a row's Delete asks “Delete comment?” quoting that row. Either toasts “Deleted comment” with Undo, which puts it back in its place. Clicking a toast keeps the thread card open.
- **Persistence:** resolved comments are hidden on the canvas but still listed in Inspect ▸ Comments. Annotations save with the scene and appear in `DESIGN_BRIEF.md` (§4) and `design-spec.json`.
