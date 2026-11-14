# src/workspace/

The scene workspace: its state, actions, agent requests, commands and the `__studio` test hook. Before editing here, read:

- [Layout and sidebar views](../../docs/guide/layout.md) (§5)
- [Menus and shortcuts](../../docs/guide/menus-and-shortcuts.md) (§11)
- [Running and testing](../../docs/guide/running-and-testing.md) (§0e)

A new `__studio` hook goes in its area's module, `devStudio/areas/<area>.ts`, or a new module there for a new area; `useDevStudioHook.ts` picks every module up on its own, so never add a hook to a shared file. Add its name to the list in `devStudio/studio.test.ts`.

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
