---
title: Queue messages for the agent
date: 2026-11-02
version: 0.1.2
image: /changelog/queue-messages-for-the-agent/cover.png
---

Press ⌘Enter while the agent works to queue the next message, then drag queued messages into a new order or edit them before they send. The agent panel shows the designer's thoughts and steps in the order they happen, and says why a tool call failed.

## Queuing

While the agent is working, type your next request and press ⌘Enter (Ctrl+Enter on Windows), or ⌘-click the Send button. The message goes into a banner that sits just above the composer, headed with how many are waiting, like "2 messages queued". When the agent finishes, the first one sends on its own, then the next, one at a time, each built at the moment it sends, so it sees the scene as the last run left it. The chevron on the banner folds it away.

A plain Enter does something different: it hands the message to the agent mid-turn. Claude Code and Codex read it between steps and carry on with it in mind. When the turn can't take it, it goes to the front of the queue instead. Right-click Send to choose between Send Now and Queue.

## Changing the queue

Hover a queued message and four controls float over its right end: Send now, Edit, Delete and a grip. Drag the grip to move a message up or down the list; ⌥↑ and ⌥↓ move one too. Delete asks first.

![A queued message on hover, with Send now, Edit and Delete](/changelog/queue-messages-for-the-agent/row.png)

Edit, or a click on the message, opens it in the composer with its images, under an "Editing queued message" bar. Whatever you'd been typing is set aside and comes back after. While you edit, the Send button turns into a tick: press Enter to put the message back in its place, or Esc to leave it as it was.

![Editing a queued message in the composer](/changelog/queue-messages-for-the-agent/edit.png)

Stop pauses the queue rather than clearing it, and the next message you send picks it up again. Each chat keeps its own queue, and it isn't saved: reloading the window empties it.

## In the transcript

The designer's thinking and each step it takes appear in the order they happen, interleaved with its reply. When a tool call fails, the step says why.
