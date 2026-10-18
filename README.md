# Basecase

A 3D robotics CAD studio with an AI agent, built for people who don't use CAD. Describe a robot or paste photos of one, and Claude designs it part by part in real CAD code (OpenSCAD + BOSL2, and replicad for fillets and lofts), places real servos, boards and ISO hardware from a catalog, and checks the result: interference, printability on a Bambu P1S, joint torque, stability and a priced bill of materials.

It's a macOS-first Electron app (React, three.js, Vite).

## Requirements

- macOS and Node.js 22 or later
- [Claude Code](https://docs.claude.com/en/docs/claude-code), signed in with `claude auth login`. The agent runs on your own Claude login through the Agent Client Protocol. An offline agent is available in Settings → Agent.

## Run it

```bash
npm install
npm run electron:dev
```

`npm run dev` serves the renderer alone at http://localhost:5173. Scenes, chats and uploads are saved to `library/` in the repo folder, which is git-ignored.

## Layout

| Path | What's there |
|---|---|
| `src/` | The renderer: canvas, panels, design system, CAD and build tools |
| `electron/` | Main process, the ACP client, the CAD MCP server and the sandboxed CAD kernel |
| `vendor/` | BOSL2 (pinned, with small patches) and the robotics OpenSCAD library |
| `public/parts/` | Meshes for the real-parts catalog |
| `tools/parts/` | Scripts that convert manufacturer CAD into those meshes; sources are listed in `sources.json` |
| `bench/` | The agent fidelity benchmark |
| `docs/` | Research notes and plans |

[AGENTS.md](AGENTS.md) is the full design, copy and architecture guide.

## Checks

```bash
npm run build
```

```bash
npm run lint
```

## License

MIT, for the code in this repository. `vendor/BOSL2` keeps its own license, and the part meshes in `public/parts` and the drawings in `tools/parts/specs` belong to their manufacturers (sources and licenses in `tools/parts/sources.json`).
