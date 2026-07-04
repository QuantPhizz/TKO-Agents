#!/usr/bin/env bash
#
# reset-slots.sh — Tear down and rebuild parallel-agent worktree slots
#                  for any project in the tko-agents ecosystem.
#
# The "slots" are git worktrees of a project repo, one per agent, each on its
# own branch so agents can work in parallel without entanglement. For project
# PROJ they live at ~/PROJ-missions/slot-N and check out branch slot/N off a
# chosen base.
#
# This script is IDEMPOTENT: run it any time to restore a clean set of N slots.
# It refuses to destroy a slot that has uncommitted changes unless --force.
#
# Usage:
#   reset-slots.sh PROJECT [-b BASE] [-n COUNT] [-f] [--no-backup]
#                  [--repo PATH] [--missions PATH] [-h]
#
#   PROJECT             Project folder name under ~/tko-agents
#                       (e.g. FTG-TKO, RaijinXSusanoo, "Mega Mewtwo")
#   -b, --base BRANCH   Base branch to create slots from   (default: main)
#   -n, --count N       Number of slots to create          (default: 6)
#   -f, --force         Rebuild even if a slot has uncommitted changes
#       --no-backup     Skip the safety tarball of existing slots
#       --repo PATH     Repo location    (default: ~/tko-agents/PROJECT)
#       --missions PATH Slots location   (default: ~/PROJECT-missions)
#   -h, --help          Show this help
#
# Examples:
#   reset-slots.sh FTG-TKO                  # rebuild 6 slots off main
#   reset-slots.sh RaijinXSusanoo -n 4      # 4 slots for RaijinXSusanoo
#   reset-slots.sh FTG-TKO -b develop -f    # force-rebuild off develop
#
set -euo pipefail

# --- Helpers -----------------------------------------------------------------
say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; }

# --- Args --------------------------------------------------------------------
PROJECT=""
BASE="main"
COUNT=6
FORCE=0
BACKUP=1
REPO=""
MISS=""

while [ $# -gt 0 ]; do
  case "$1" in
    -b|--base)    BASE="$2"; shift 2 ;;
    -n|--count)   COUNT="$2"; shift 2 ;;
    -f|--force)   FORCE=1; shift ;;
    --no-backup)  BACKUP=0; shift ;;
    --repo)       REPO="$2"; shift 2 ;;
    --missions)   MISS="$2"; shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    -*)           echo "Unknown option: $1" >&2; exit 2 ;;
    *)            [ -n "$PROJECT" ] && { echo "Unexpected argument: $1" >&2; exit 2; }
                  PROJECT="$1"; shift ;;
  esac
done

[ -n "$PROJECT" ] || { usage >&2; echo >&2; die "PROJECT argument is required"; }

REPO="${REPO:-$HOME/tko-agents/$PROJECT}"
MISS="${MISS:-$HOME/$PROJECT-missions}"
BRANCH_PREFIX="slot/"      # branch names: slot/1, slot/2, ...
SLOT_PREFIX="slot-"        # dir names:    slot-1, slot-2, ...

git_repo() { git -C "$REPO" "$@"; }

# --- Preflight ---------------------------------------------------------------
[ -d "$REPO/.git" ] || die "Repo not found at $REPO (use --repo to override)"
git_repo rev-parse --verify --quiet "$BASE" >/dev/null \
  || die "Base branch '$BASE' does not exist in $REPO"
mkdir -p "$MISS"

BASE_SHA="$(git_repo rev-parse --short "$BASE")"
say "Project: $PROJECT"
say "Repo:    $REPO"
say "Slots:   $MISS"
say "Base:    $BASE ($BASE_SHA)"
say "Count:   $COUNT slot(s)"

# --- Safety: scan existing slots for uncommitted work ------------------------
DIRTY=()
for i in $(seq 1 "$COUNT"); do
  d="$MISS/${SLOT_PREFIX}$i"
  [ -e "$d/.git" ] || continue
  if git -C "$d" rev-parse --git-dir >/dev/null 2>&1; then
    if [ -n "$(git -C "$d" status --porcelain 2>/dev/null)" ]; then
      DIRTY+=("$i")
    fi
  fi
done
if [ "${#DIRTY[@]}" -gt 0 ]; then
  warn "Slots with uncommitted changes: ${DIRTY[*]}"
  if [ "$FORCE" -ne 1 ]; then
    die "Refusing to destroy uncommitted work. Commit/stash it, or rerun with --force."
  fi
  warn "--force given: those changes WILL be discarded."
fi

# --- Safety: archive existing slot contents (source only) --------------------
if [ "$BACKUP" -eq 1 ] && [ -n "$(ls -A "$MISS" 2>/dev/null)" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BK="$HOME/$(basename "$MISS")-backup-$STAMP.tar.gz"
  say "Archiving existing slots -> $BK"
  tar --exclude='node_modules' --exclude='.next' --exclude='dist' \
      --exclude='.venv' --exclude='__pycache__' --exclude='.wrangler' \
      --exclude='.DS_Store' --exclude='lib' \
      -czf "$BK" -C "$(dirname "$MISS")" "$(basename "$MISS")" 2>/dev/null \
      && say "Backup: $(du -h "$BK" | cut -f1)" \
      || warn "Backup step failed (continuing anyway)"
fi

# --- Teardown ----------------------------------------------------------------
say "Tearing down existing worktrees + branches..."
for i in $(seq 1 "$COUNT"); do
  d="$MISS/${SLOT_PREFIX}$i"
  git_repo worktree remove --force "$d" >/dev/null 2>&1 || true
  rm -rf "$d" 2>/dev/null || true      # clears Finder-recreated .DS_Store etc.
  git_repo branch -D "${BRANCH_PREFIX}$i" >/dev/null 2>&1 || true
done
git_repo worktree prune

# --- Rebuild -----------------------------------------------------------------
say "Creating $COUNT fresh slot(s) off $BASE..."
for i in $(seq 1 "$COUNT"); do
  d="$MISS/${SLOT_PREFIX}$i"
  git_repo worktree add -b "${BRANCH_PREFIX}$i" "$d" "$BASE" >/dev/null
  printf '   slot-%s -> branch %s%s @ %s\n' "$i" "$BRANCH_PREFIX" "$i" "$BASE_SHA"
done

# --- Verify ------------------------------------------------------------------
echo
say "Done. Worktrees registered:"
git_repo worktree list
echo

# Dependency hints based on what the project actually uses
S1="$MISS/${SLOT_PREFIX}1"
[ -f "$S1/package.json" ] \
  && warn "Fresh slots have NO node_modules — run 'npm install' in a slot before building."
[ -f "$S1/requirements.txt" ] || [ -n "$(ls "$S1"/*/requirements.txt 2>/dev/null)" ] \
  && warn "Fresh slots have NO .venv — create one and 'pip install -r requirements.txt' before running."
exit 0
