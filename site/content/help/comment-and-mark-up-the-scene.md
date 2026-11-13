---
title: Comment and mark up the scene
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 10
keywords:
  - comment
  - comments
  - pin
  - thread
  - reply
  - resolve
  - annotate
  - annotation
  - marker
  - draw
  - markup
  - feedback
related:
  - add-a-reference-image
  - choose-the-agent
covers:
  - src/components/Annotations.tsx
  - src/components/annotations/
  - src/components/inspector/CommentsSection.tsx
  - src/workspace/useAnnotations.ts
  - src/workspace/MarkBar.tsx
  - src/workspace/useMarks.ts
  - src/utils/aiHandoff.ts
---

Pin a comment to a spot on a part, or draw colored marks over the scene to show the agent what to change.

## Pin a comment

1. Press [[M]] for **Comment**.
2. Click a part, or the floor, where the comment belongs.
3. Type the comment and press [[↩]].

The pin is numbered and moves with its part. Click a pin to open it, where you can reply, **Resolve** it or **Delete comment**.

Resolved comments leave the canvas but stay in the Inspector under **Comments** with nothing selected. Hover a comment to edit or delete it; deleting asks first, and a toast offers Undo. **Comment Here**, in any right-click menu, drops a pin where you clicked.

Open comments are part of the scene's brief, which **Export** ▸ **Copy as Markdown** copies.

## Mark up the scene for the agent

1. Press [[N]] for **Annotate**.
2. Pick a color in the bar above the toolbar: red, orange, yellow, green or a custom one.
3. Drag on the canvas to circle a part or underline an edge.
4. Type a label for the mark, such as “too thin”, and press [[↩]].
5. Click **Done** when you've finished.

Each mark records the parts it circles or crosses and the view you drew it from. The next message you send the agent lists every mark with its color, label and parts, so “yellow is right, orange is wrong” is enough.

Drag a mark to move it. To remove marks, pick **Eraser** ([[E]]) and click or drag across them, or select one and press [[⌫]]. **Delete marks** removes them all after asking. Marks are saved with the scene.
