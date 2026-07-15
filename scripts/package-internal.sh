#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/dist/koubo-clip"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
TARBALL="$ROOT/dist/koubo-clip-$PLATFORM-$ARCH.tgz"
DIGEST_FILE="$TARBALL.sha256"
VERSION="$(node -p "require('$ROOT/package.json').version")"

rm -rf "$OUT_DIR" "$TARBALL" "$DIGEST_FILE"
mkdir -p "$OUT_DIR/bin" "$OUT_DIR/resources" "$OUT_DIR/skills"

bun build --compile --define "KOUBO_CLIP_BUILD_VERSION=\"$VERSION\"" --outfile "$OUT_DIR/bin/koubo-clip" "$ROOT/packages/cli/src/cli.ts"
cp -R "$ROOT/packages/cli/vendor/hyperframes" "$OUT_DIR/resources/hyperframes"
cp -R "$ROOT/skills/koubo-clip" "$OUT_DIR/skills/koubo-clip"
KOUBO_CLIP_SOURCE_REVISION="$(git -C "$ROOT" rev-parse HEAD)" KOUBO_CLIP_VERSION="$VERSION" bun "$ROOT/scripts/generate-delivery-manifest.ts" "$OUT_DIR" internal

ACTUAL_VERSION="$("$OUT_DIR/bin/koubo-clip" --version)"
if [[ "$ACTUAL_VERSION" != "$VERSION" ]]; then
  echo "compiled CLI version mismatch: expected $VERSION, got $ACTUAL_VERSION" >&2
  exit 1
fi
"$OUT_DIR/bin/koubo-clip" capabilities --json >/dev/null
KOUBO_CLIP_DISTRIBUTION_ROOT="$OUT_DIR" "$OUT_DIR/bin/koubo-clip" delivery verify --json >/dev/null
KOUBO_CLIP_DISTRIBUTION_ROOT="$OUT_DIR" "$OUT_DIR/bin/koubo-clip" skills verify --path "$OUT_DIR/skills/koubo-clip" --json >/dev/null

cat > "$OUT_DIR/INSTALL.md" <<'EOF'
# koubo-clip internal package

Public distribution is the `koubo-clip` npm package. This tarball is an optional standalone binary package for local or internal use.

This package contains:

- `bin/koubo-clip`: standalone CLI binary
- `resources/hyperframes`: sidecar render/catalog resources used by the CLI
- `skills/koubo-clip`: the agent skill to install into Codex/Claude/Hermes-style hosts
- `delivery-manifest.json`: immutable CLI/resources/Skill compatibility identity

## Quick check

```bash
./bin/koubo-clip --version
./bin/koubo-clip capabilities --json
./bin/koubo-clip --help
./bin/koubo-clip doctor
./bin/koubo-clip skills path --json
./bin/koubo-clip delivery verify --json
./bin/koubo-clip skills verify --json
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

Provider keys, MCP config, FFmpeg, ffprobe, and network access are local machine setup. HyperFrames is version-locked by the delivery manifest and must be available as the matching local binary; the CLI never downloads it at render time. The default env file is `~/.koubo-clip/.env`; a current-directory `.env` can temporarily override it.
EOF

(cd "$ROOT/dist" && tar -czf "$(basename "$TARBALL")" koubo-clip)
TARBALL_SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
printf '%s  %s\n' "$TARBALL_SHA256" "$(basename "$TARBALL")" > "$DIGEST_FILE"
echo "$TARBALL"
echo "$DIGEST_FILE"
