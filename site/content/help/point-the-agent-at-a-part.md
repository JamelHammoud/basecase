---
title: Point the agent at a part
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 6
keywords:
  - reference part
  - mention
  - quote
  - annotate
  - mark
  - select for agent
  - context
related:
  - attach-photos-files-and-sketches
  - requests-that-get-good-results
covers:
  - src/workspace/contextMenuItems.tsx
  - src/workspace/partActions.tsx
  - src/agent/partQuote.ts
  - src/agent/agentMarks.ts
  - src/components/agent/messageText.ts
  - src/components/build/FindingRow.tsx
---

Tell the agent exactly which part, area or message you mean, since it doesn't see what you've selected.

## Quote a part

1. Right-click the part on the canvas.
2. Choose **Quote Part**.
3. Type what to change, such as “Move this 10 mm forward”, and press [[↩]].

The quote sends the part's name, id and position along with your message. With the part selected, **Quote Part** is in [[⌘K]] too.

## Draw on the canvas

1. Press [[N]] to start **Annotate**.
2. Draw around the area you mean. Pick another color from the bar to tell marks apart.
3. Click **Done**, then send your message.

The agent reads each mark's color and the parts it circles. Marks aren't parts, so they never reach the bill of materials or a print.

## Quote a message

1. Right-click a message in the chat.
2. Choose **Quote Message**, then type your reply.

From the **Build** tab, a Check's **Fix** button sends the agent a fix request for that problem. Its menu has **Quote**, to ask about it first.
