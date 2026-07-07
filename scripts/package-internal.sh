#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/dist/koubo-clip"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
TARBALL="$ROOT/dist/koubo-clip-$PLATFORM-$ARCH.tgz"

rm -rf "$OUT_DIR" "$TARBALL"
mkdir -p "$OUT_DIR/bin" "$OUT_DIR/resources" "$OUT_DIR/skills"

bun build --compile --outfile "$OUT_DIR/bin/koubo-clip" "$ROOT/packages/cli/src/cli.ts"
cp -R "$ROOT/packages/cli/vendor/hyperframes" "$OUT_DIR/resources/hyperframes"
cp -R "$ROOT/skills/koubo-clip" "$OUT_DIR/skills/koubo-clip"

cat > "$OUT_DIR/INSTALL.md" <<'EOF'
# koubo-clip internal package

Public distribution is the `koubo-clip` npm package. This tarball is an optional standalone binary package for local or internal use.

This package contains:

- `bin/koubo-clip`: standalone CLI binary
- `resources/hyperframes`: sidecar render/catalog resources used by the CLI
- `skills/koubo-clip`: the agent skill to install into Codex/Claude/Hermes-style hosts

## Quick check

```bash
./bin/koubo-clip --help
./bin/koubo-clip doctor
./bin/koubo-clip skills path --json
./bin/koubo-clip skills install --target codex
./bin/koubo-clip skills install --target claude
./bin/koubo-clip skills install --target hermes
```

## Install skill

```bash
./bin/koubo-clip skills install --target codex
./bin/koubo-clip skills install --target claude
./bin/koubo-clip skills install --target hermes
```

Default directories:

- Codex: `~/.agents/skills/koubo-clip`
- Claude Code: `~/.claude/skills/koubo-clip`
- Hermes Agent: `~/.hermes/skills/koubo-clip`

Use `--dest <skills-dir>` to install into a custom skills directory.

Provider keys, MCP config, FFmpeg, ffprobe, npx, and network access are local machine setup. They are not bundled into this package. The default env file is `~/.koubo-clip/.env`; a current-directory `.env` can temporarily override it.
EOF

(cd "$ROOT/dist" && tar -czf "$(basename "$TARBALL")" koubo-clip)
echo "$TARBALL"
