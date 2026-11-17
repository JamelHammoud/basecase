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
- **Attachment lookup:** `utils/annotationAttachments.ts` indexes parts once per batch for pin layout and scene export. Export resolves each open comment once, sharing its part and world position between JSON and Markdown. Hidden parts and reference images remain valid attachments. A missing part or offset keeps the saved position, and duplicate part IDs keep the first match. Positions use translation plus offset, with no rotation. Each call reads the current parts, so moving, renaming, deleting and undoing refresh attachments.
- **Layout:** pins and their open card update after a viewport render or a change to their annotations, parts or draft. A `ResizeObserver` also repositions the card when its contents or canvas area change size. Empty layers do no projection work, and pins never run their own animation loop (§0f).

## Performance: annotation projection

Measurements and limits: [Annotation projection performance evidence](../notes/performance-annotations.md).

- **Comment attachments resolve in linear work.** `utils/annotationAttachments.ts` builds one part index per batch for canvas pins and scene exports. JSON and Markdown share the export's resolved comments instead of searching the scene four times per comment. [Evidence](../notes/performance-annotations.md#comment-attachments-resolve-in-linear-work).

- **DOM overlays follow viewport renders.** Comment pins and agent cursors project through the handle's `onRender` subscription, not separate animation loops. An empty comment layer and a hidden cursor subscribe to nothing. Comment cards also reflow through a `ResizeObserver` on the layer and card. A cursor animates toward its last projection only until it settles within 0.05 px, then stops requesting frames. Effect cleanup removes render listeners, resize observers and pending cursor frames.

- **Stroke attachment probes reuse their workspace.** `three/viewport/markParts.ts` retains one direction vector and one intersection list per `partsUnder` call. Each sampled point clears the list before raycasting, preserving nearest-hit selection and first-seen part order. Moving a mark uses this shared attachment path. `markParts.test.ts` checks real mesh hits, misses after hits, changed geometry placement, unchanged inputs and sampling across the 48-probe boundary. [Evidence](../notes/performance-annotations.md#stroke-attachment-probes-reuse-their-workspace).

- **Mark picking normalizes only the nearest segment distance.** `three/viewport/markMath.ts` compares squared screen-space distances, then takes one square root per polyline. Selection, drag targeting and erasing share this path through `MarkLayer`. Projection order, endpoint clamping, repeated endpoints and pixel hit thresholds stay unchanged. `markMath.test.ts` covers diagonal and vertical segments, endpoint clamps, reversed traversal, exact hits and edited points. [Evidence](../notes/performance-annotations.md#mark-picking-normalizes-only-the-nearest-distance).
