#!/bin/sh
set -eu
ROOT=$(git rev-parse --show-toplevel)
COMMON=$(git rev-parse --path-format=absolute --git-common-dir)
docker build -q -t basecase-hw-linux-gate -f "$ROOT/hw/emu/linux-gate.Dockerfile" "$ROOT/hw/emu" > /dev/null
exec docker run --rm \
  -v "$ROOT:$ROOT" \
  -v "$COMMON:$COMMON:ro" \
  -v basecase-hw-linux-target:"$ROOT/hw/target" \
  -v basecase-hw-linux-cargo:/root/.cargo/registry \
  -v basecase-hw-linux-uv:/root/.cache/uv \
  -w "$ROOT" \
  basecase-hw-linux-gate \
  node verify/gatekeeper.mjs s5-emu-daemon
