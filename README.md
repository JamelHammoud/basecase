<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg" />
    <img src=".github/assets/logo-light.svg" width="50" alt="Basecase" />
  </picture>
</p>
<h4>
  <a href="https://github.com/JamelHammoud/basecase/releases/latest/download/Basecase.dmg">Download for Mac</a>
  ·
  <a href="https://github.com/JamelHammoud/basecase/releases/latest/download/Basecase-Setup.exe">Download for Windows</a>
</h4>
<hr/>

Basecase is a playground for designing buildable robotics.

<img height="600" src="https://github.com/user-attachments/assets/00133dc3-7084-45ff-8dac-de417fe0749a" />


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

Read [AGENTS.md](AGENTS.md) §0 first. Formatting, lint rules and tests are enforced by a pre-commit hook; run `npm run check` before you push, and `npm run test:e2e` after UI changes.

To add a part to the catalog, ask your coding agent to “add this part: ⟨link⟩”. It follows [.agents/skills/add-part/SKILL.md](.agents/skills/add-part/SKILL.md), which you can also follow by hand.
