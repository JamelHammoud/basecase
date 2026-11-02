<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg" />
    <img src=".github/assets/logo-light.svg" width="50" alt="Basecase" />
  </picture>
</p>
<h4>
  <a href="https://app.basecase.so">Open in Browser</a>
  ·
  <a href="https://github.com/JamelHammoud/basecase/releases/latest/download/Basecase.dmg">Download for Mac</a>
  ·
  <a href="https://github.com/JamelHammoud/basecase/releases/latest/download/Basecase-Setup.exe">Download for Windows</a>
</h4>
<hr/>

Basecase is a playground for designing buildable robotics.

<img height="450" alt="image" src="https://github.com/user-attachments/assets/416e6b37-b369-463f-8871-7c0594d5701d" />

### Requirements

- macOS and Node.js 22 or later
- [Claude Code](https://docs.claude.com/en/docs/claude-code)

The optional AI agent uses your locally running Claude Code through the [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction).

### Install & run

```bash
npm install
npm start
```

`npm start` builds the app and runs it at full speed. For development with hot reload, use `npm run electron:dev`.

### Contributing

Read [AGENTS.md](AGENTS.md) first: it holds the rules every change follows and an index of the area guides in [`docs/guide/`](docs/guide/). Formatting, lint rules and tests are enforced by a pre-commit hook; run `npm run check` before you push, and `npm run test:e2e` after UI changes.

To add a part to the catalog, ask your coding agent to “add this part: ⟨link⟩”. It follows [.agents/skills/add-part/SKILL.md](.agents/skills/add-part/SKILL.md), which you can also follow by hand.
