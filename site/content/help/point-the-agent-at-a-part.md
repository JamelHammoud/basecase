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

The agent doesn't see what you've selected. To show it which part, area or message you mean, quote it or draw on it.

- Quote a part
- Draw on the canvas
- Quote a message

## Quote a part

1. Right-click the part on the canvas.
2. Choose **Quote Part**.
3. Type what to change, such as “Move this 10 mm forward”, and press [[↩]].

The quote goes to the agent with your message and includes the part's name, id and position. You can also find **Quote Part** in [[⌘K]] when the part is selected.

## Draw on the canvas

1. Press [[N]] to start **Annotate**.
2. Draw around the area you mean. To tell marks apart, pick another color from the bar.
3. Click **Done**, then send your message.

The agent reads the color of each mark and the parts it circles. Marks aren't parts, so they never show up in the bill of materials or in a print.

## Quote a message

1. Right-click a message in the chat.
2. Choose **Quote Message**, then type your reply.

Each Check in the **Build** tab has a **Fix** button that sends the agent a request to fix that problem. To ask the agent about the problem first, choose **Quote** from the button's menu.
