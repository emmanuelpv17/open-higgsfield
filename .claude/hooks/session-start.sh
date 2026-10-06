#!/bin/bash
# Installs the graphify CLI in Claude Code cloud sessions. The /graphify skill
# itself is committed under .claude/skills/graphify; the version here matches it.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GRAPHIFY_VERSION="0.9.77"

if command -v graphify >/dev/null 2>&1 && uv tool list 2>/dev/null | grep -q "graphifyy v${GRAPHIFY_VERSION}"; then
  exit 0
fi

uv tool install --force "graphifyy==${GRAPHIFY_VERSION}" >/dev/null 2>&1
echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${CLAUDE_ENV_FILE:-/dev/null}"
