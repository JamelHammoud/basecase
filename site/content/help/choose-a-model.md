---
title: Choose a model and effort
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 2
keywords:
  - model picker
  - opus
  - sonnet
  - haiku
  - reasoning
  - thinking
  - effort
  - context window
  - tokens
  - cost
related:
  - choose-the-agent
  - requests-that-get-good-results
covers:
  - src/components/agent/ModelMenu.tsx
  - src/components/agent/ContextStatus.tsx
  - electron/backend/sessionModels.mjs
  - src/app/useAgentConnection.ts
---

You can choose which of your agent's models designs with you, and how long it thinks before it acts.

1. Open the **Agent** tab in the right panel.
2. Click the model's name at the bottom of the composer, next to the send button.
3. Choose a model.
4. If you see an **Effort** slider under the list, drag it to the level you want.

The list shows the newest model in each family from the agent you're signed in to. Higher effort makes the model think longer before each step.

Your choice applies to every scene, starting with your next message. Basecase keeps a separate choice for each agent, so switching agents doesn't lose it.

The menu also shows **Context**, which is how much of the model's memory the chat has used, counted in tokens. If the agent reports it, you'll see the cost so far too. The bar turns amber once it reaches 80%. Past that point, you can start a [new chat](/help/open-a-past-chat) to give the model a clean memory.

**Note:** The model menu doesn't appear for Offline, which has no model, or before the agent connects. Gemini has no **Effort** slider.
