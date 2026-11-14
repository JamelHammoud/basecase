# src/vision/

Local camera inference, its worker, model manifests, verified model storage and timestamped results. Before editing here, read:

- [Cameras](../../docs/guide/cameras.md) (§8l)
- [Routines](../../docs/guide/routines.md) (§8j)
- [Performance](../../docs/guide/performance.md) (§0f)
- [Security](../../docs/guide/security.md) (§0h)

The root [AGENTS.md](../../AGENTS.md) applies here too. Model weights stay in local storage, never in git. Decode boxes into normalized source-image coordinates and preserve the source timestamp. Depth maps carry their units so relative depth cannot be read as metres.
