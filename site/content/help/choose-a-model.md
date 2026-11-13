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

Pick which of your agent's models designs with you, and how long it thinks before it acts.

1. Open the **Agent** tab in the right panel.
2. Click the model's name at the bottom of the composer, next to the send button.
3. Choose a model.
4. If an **Effort** slider shows under the list, drag it to the level you want.

The list comes from the agent you're signed in to, and shows the newest model in each family. Higher effort thinks longer before each step.

Your choice applies to every scene, from the next message on. Basecase keeps a separate choice for each agent, so switching agents doesn't lose it.

The same menu shows **Context**: how much of the model's memory this chat has used, in tokens. When the agent reports it, the cost so far shows too. The bar turns amber from 80%. Past that, a [new chat](/help/open-a-past-chat) starts with a clean memory.

The model menu doesn't show for Offline, which has no model, or before the agent connects. Gemini has no **Effort** slider.
