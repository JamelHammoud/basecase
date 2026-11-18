# src/utils/designParameters/

Shared dimension expressions, dependency resolution and geometry preparation. Before editing here, read:

- [Inspector and selection](../../../docs/guide/inspector-and-selection.md) (§7)
- [Build](../../../docs/guide/build.md) (§8b)
- [Agent](../../../docs/guide/agent.md) (§9)
- [Performance](../../../docs/guide/performance.md) (§0f)

The rules in the root [AGENTS.md](../../../AGENTS.md) apply here too. Keep expression evaluation independent of JavaScript execution. Geometry preparation reuses the existing CAD, Sketch and mate implementations.
