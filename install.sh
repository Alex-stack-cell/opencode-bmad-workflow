#!/usr/bin/env bash
set -euo pipefail

# ─── opencode-bmad-workflow installer ────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }

echo ""
echo "opencode-bmad-workflow — installer"
echo "────────────────────────────────────"
echo "Source : $REPO_DIR"
echo "Target : $TARGET_DIR"
echo ""

# ─── Check opencode is installed ──────────────────────────────────────────────

if ! command -v opencode &>/dev/null; then
  warn "opencode not found in PATH — install it from https://opencode.ai before using this plugin"
fi

# ─── Check Bun or Node ────────────────────────────────────────────────────────

if command -v bun &>/dev/null; then
  PKG_MANAGER="bun"
elif command -v node &>/dev/null; then
  PKG_MANAGER="npm"
else
  fail "Neither bun nor node found. Install Bun (https://bun.sh) or Node.js first."
fi

# ─── If installing into an external target directory, copy files ───────────────

if [ "$REPO_DIR" != "$TARGET_DIR" ]; then
  echo "Copying files to $TARGET_DIR..."
  mkdir -p "$TARGET_DIR"

  for dir in agents commands plugins; do
    if [ -d "$REPO_DIR/$dir" ]; then
      cp -r "$REPO_DIR/$dir" "$TARGET_DIR/"
      ok "Copied $dir/"
    fi
  done

  for file in package.json; do
    if [ -f "$REPO_DIR/$file" ]; then
      cp "$REPO_DIR/$file" "$TARGET_DIR/$file"
    fi
  done
else
  ok "Already in config directory — skipping file copy"
fi

# ─── Install dependencies ─────────────────────────────────────────────────────

echo ""
echo "Installing dependencies..."
cd "$TARGET_DIR"

if [ "$PKG_MANAGER" = "bun" ]; then
  bun install --silent
else
  npm install --silent
fi
ok "Dependencies installed (using $PKG_MANAGER)"

# ─── Patch opencode.json ──────────────────────────────────────────────────────

CONFIG_FILE="$TARGET_DIR/opencode.json"
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<EOF
{
  "plugin": ["./plugins"]
}
EOF
  ok "Created opencode.json with plugin registration"
else
  if grep -q '"plugin"' "$CONFIG_FILE"; then
    if grep -q '"./plugins"' "$CONFIG_FILE"; then
      ok "opencode.json already has plugin registered"
    else
      warn "opencode.json has a 'plugin' key but './plugins' is not listed."
      warn "Add it manually:"
      warn '  "plugin": ["./plugins"]'
    fi
  else
    # Inject "plugin" key using python (available on macOS/Linux)
    if command -v python3 &>/dev/null; then
      python3 - "$CONFIG_FILE" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
data["plugin"] = ["./plugins"]
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
      ok "Registered plugin in opencode.json"
    else
      warn "Could not auto-patch opencode.json (python3 not found)."
      warn "Add this manually to $CONFIG_FILE:"
      warn '  "plugin": ["./plugins"]'
    fi
  fi
fi

# ─── Verify agents ────────────────────────────────────────────────────────────

echo ""
AGENTS_DIR="$TARGET_DIR/agents"
MISSING_AGENTS=()

for agent in pm architect analyst reviewer dev; do
  if [ ! -f "$AGENTS_DIR/$agent.md" ]; then
    MISSING_AGENTS+=("$agent")
  fi
done

if [ ${#MISSING_AGENTS[@]} -gt 0 ]; then
  warn "Missing agent files: ${MISSING_AGENTS[*]}"
  warn "The following workflows need them:"
  for a in "${MISSING_AGENTS[@]}"; do
    case "$a" in
      pm)        warn "  pm       → used by workflow_epic, workflow_story, workflow_sprint" ;;
      architect) warn "  architect → used by workflow_story (tasks + dev notes)" ;;
      analyst)   warn "  analyst   → used by workflow_review" ;;
      reviewer)  warn "  reviewer  → used by workflow_review" ;;
      dev)       warn "  dev       → used by workflow_story_dev (must support tool calling)" ;;
    esac
  done
  echo ""
  warn "Create missing agent files in $AGENTS_DIR/ before using these workflows."
else
  ok "All required agents found"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────"
ok "Installation complete — restart opencode to activate the plugin"
echo ""
echo "Quick start:"
echo "  /workflow-setup    → set your language (fr, en, es…)"
echo "  /workflow-init     → list all available workflows"
echo "  /workflow-epic     → create your first epic"
echo ""
