#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Point Git to scripts/hooks/ so the committed hook files are used directly.
# This is idempotent and persists in .git/config (no token is stored here).
HOOKS_DIR="$(git rev-parse --show-toplevel)/scripts/hooks"
git config core.hooksPath "$HOOKS_DIR"
chmod +x "$HOOKS_DIR"/*
echo "[github-sync] core.hooksPath set to $HOOKS_DIR"

# Also run the post-commit hook immediately to push the current merge commit.
if [ -x "$HOOKS_DIR/post-commit" ]; then
  "$HOOKS_DIR/post-commit"
fi
