---
title: Queue messages for the agent
date: 2026-11-02
version: 0.1.2
image: /changelog/queue-messages-for-the-agent/cover.png
---

You can now line up your next messages while the agent is still working. Press ⌘Enter, or Ctrl+Enter on Windows, and the message waits instead of joining the run.

## Queuing

While the agent is working, type your next request and press ⌘Enter (Ctrl+Enter on Windows), or ⌘-click the Send button. Queuing is for the next thing: “now add mounting holes” while the agent is still shaping the bracket. The message goes into a banner above the composer, headed with how many are waiting, like "2 messages queued". When the agent finishes, the first one sends on its own, then the next, one at a time. Each is built at the moment it sends, so it sees the scene as the last run left it.

The chevron on the banner folds it away.

A plain Enter still steers the run in progress: it hands the message to the agent mid-turn. Claude Code and Codex read it between steps and carry on with it in mind. When the turn can't take it, it goes to the front of the queue instead. Gemini can't steer, so with Gemini every message you send mid-run queues. Right-click Send to choose between Send Now and Queue.

## Changing the queue

Hover a queued message and four controls float over its right end: Send now, Edit, Delete and a grip. Drag the grip to move a message up or down the list; ⌥↑ and ⌥↓ move one too. Delete asks first.

![A queued message on hover, with Send now, Edit and Delete](/changelog/queue-messages-for-the-agent/row.png)

Edit, or a click on the message, opens it in the composer with its images, under an "Editing queued message" bar. Whatever you'd been typing is set aside and comes back after. While you edit and the agent is still working, the Send button turns into a tick. Press Enter to put the message back in its place, or Esc to leave it as it was.

![Editing a queued message in the composer](/changelog/queue-messages-for-the-agent/edit.png)

Stop pauses the queue rather than clearing it, and the next message you send picks it up again. Each chat keeps its own queue, and it isn't saved: reloading the app empties it.

## In the transcript

The designer's thinking and each step it takes appear in the order they happen, interleaved with its reply. When a tool call fails, the step says why.
