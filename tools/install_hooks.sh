#!/usr/bin/env bash
# Install local git hooks that mirror the CI status checks.
#
# Usage:  tools/install_hooks.sh
#
# Re-run after changing the hook body below.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-push"

cat > "$HOOK" <<'HOOK_BODY'
#!/usr/bin/env bash
# Pre-push: verify data/flags.json is up to date before letting a push out.
# Mirrors the "Index up to date" check enforced by branch protection on
# master, so failures surface here instead of after the round-trip to CI.
# Bypass with `git push --no-verify` if you really mean it.

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! python3 tools/build_index.py --check; then
  cat >&2 <<'MSG'

Push aborted: data/flags.json is out of date.

To fix:
  python3 tools/build_index.py
  git add data/flags.json
  git commit --amend --no-edit       # or commit it as its own change

(Or skip this guard with  git push --no-verify  if you really mean it.)
MSG
  exit 1
fi
HOOK_BODY

chmod +x "$HOOK"
echo "Installed pre-push hook at $HOOK"
echo
echo "It will run 'python3 tools/build_index.py --check' on every push and"
echo "abort if data/flags.json is stale. Bypass with --no-verify if needed."
