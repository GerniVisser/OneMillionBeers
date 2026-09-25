#!/bin/sh
set -eu

# Git hooks inherit the environment of whatever launched git. A terminal has the
# Node toolchain on PATH; VS Code's source control panel, and GUI git clients in
# general, start from the desktop session's PATH and do not, so `pnpm` is simply
# not found and the commit is refused. mise installs to /usr/bin, which is always
# reachable, so fall back to resolving the toolchain through it.

if command -v pnpm >/dev/null 2>&1; then
  exec pnpm lint-staged
fi

if command -v mise >/dev/null 2>&1; then
  exec mise exec -- pnpm lint-staged
fi

echo "pre-commit: pnpm is not on PATH and mise is not installed." >&2
echo "Commit from a shell with the Node toolchain active, or set SKIP_SIMPLE_GIT_HOOKS=1 to bypass." >&2
exit 1
