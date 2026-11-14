---
title: Queue messages for the agent
date: 2026-11-02
version: 0.1.2
image: /changelog/queue-messages-for-the-agent/cover.png
---

You can now line up your next messages while the agent is still working. They wait for the run to finish, then send one at a time.

## Queuing

While the agent works, type your next request and press ⌘Enter (Ctrl+Enter on Windows), or ⌘-click the Send button. That way you can ask for the next thing, like "now add mounting holes", while the agent is still shaping the bracket.

The message goes into a banner above the composer, and the banner's header says how many are waiting, like "2 messages queued". When the agent finishes, the first one sends on its own, then the next, one at a time. Each message is built when it sends, so it sees the scene as the last run left it.

Click the chevron on the banner to fold it away.

A plain Enter still steers the run in progress. It hands the message to the agent mid-turn. Claude Code and Codex read it between steps and carry on with it in mind. When the turn can't take it, the message goes to the front of the queue instead. Gemini can't steer, so with Gemini every message you send mid-run is queued.

Right-click Send to choose between Send Now and Queue.

## Changing the queue

Hover a queued message and four controls show up over its right end: Send now, Edit, Delete and a grip. Drag the grip to move a message up or down the list, or press ⌥↑ and ⌥↓. Delete asks first.

![A queued message on hover, with Send now, Edit and Delete](/changelog/queue-messages-for-the-agent/row.png)

Click Edit, or the message itself, and it opens in the composer with its images, under an "Editing queued message" bar. Whatever you'd been typing is set aside and comes back after. If the agent is still working while you edit, the Send button turns into a tick. Press Enter to put the message back in its place, or Esc to leave it as it was.

![Editing a queued message in the composer](/changelog/queue-messages-for-the-agent/edit.png)

Stop pauses the queue instead of clearing it, and the next message you send starts it again. Each chat has its own queue. The queue isn't saved, so reloading the app empties it.

## In the transcript

The designer's thinking and each step it takes now show up in the order they happen, between the parts of its reply. When a tool call fails, the step says why.
