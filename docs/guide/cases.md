# Cases

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8h. Cases

A Case is a world with a robot slot, controls and goals that any compatible robot can enter. It lives in `src/cases/`.

- **A Case is the test.** A Skill (§8i) is a solution to it.
- **Case objects never edit parts.** They render on their own layer, and stay out of the BOM, Build Check and picking.
- **Every Case says "Tried in simulation only"** until a real robot has earned otherwise (§0k).
