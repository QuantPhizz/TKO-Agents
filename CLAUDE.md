# TKO-AGENTS ECOSYSTEM CLAUDE.md — Tier 2
# Owner: Nick (shugogeta)
# Location: ~/tko-agents/CLAUDE.md
# Scope: All Claude Code sessions opened inside ~/tko-agents/ or any subfolder
# Last Updated: February 2026
#
# HIERARCHY POSITION:
#   Tier 1 (above): ~/.claude/CLAUDE.md          — always active, all sessions
#   Tier 2 (this):  ~/tko-agents/CLAUDE.md       — active for all tko-agents work
#   Tier 3 (below): ~/tko-agents/[project]/CLAUDE.md — project-specific only
#
# Everything in Tier 1 is already in effect. This file adds to it.
# Nothing here overrides Tier 1. Nothing in Tier 3 overrides this file.

---

## SECTION 1 — THE TKO-AGENTS ECOSYSTEM

This directory is the home of all AI agent projects built by Nick. Each
subdirectory is a discrete, independent project with its own architecture,
its own CLAUDE.md, and its own scope. Projects do not share state,
dependencies, secrets, or configuration unless explicitly documented and
authorised by the owner.

Known agent projects in this ecosystem (update as projects are added):

  FTG-TKO/     — Quantum Bingo. Primary active project. Prediction market
                  grid application. See Tier 3 CLAUDE.md for full context.

  RaijinXSusanoo/ — Automated options trading: RAIJIN (premium selling)
                  + SUSANOO (long premium). Own repo:
                  github.com/QuantPhizz/RaijinXSusanoo. Split from the
                  local tko-agents tree 2026-07-04. See its Tier 3
                  CLAUDE.md for live topology and locked risk params.

# ---------------------------------------------------------------
# ADD OTHER AGENT PROJECT NAMES AND DESCRIPTIONS HERE AS CREATED.
# Format:
#   project-folder/  — Short description of what this agent does.
# ---------------------------------------------------------------

---

## SECTION 2 — GIT STRUCTURE ACROSS THE ECOSYSTEM

Every project in this ecosystem follows the same Git conventions
established in Tier 1 Section 4. This section adds ecosystem-level
guidance for managing multiple project repositories simultaneously.

Each project in tko-agents has its own dedicated private GitHub
repository. Projects do not share repositories. A single repo per
project ensures that commit history, branch protection, and access
controls are scoped correctly to that project alone.

The three-branch model applies to every project:
  main        — Owner-push by default. Permission-basis exception for
                 structured setup tasks only (see Tier 1 Section 4D).
  develop     — Agent output lands here after owner review.
  feature/*   — Per-agent or per-task branches. Merge to develop only.

When a new project is initialised in this ecosystem, the first Git
actions Claude Code may perform after being granted setup permission are:

  1. git init
  2. Create .gitignore appropriate for the project stack.
  3. Commit the initial CLAUDE.md files (Tier 3 + any project config).
  4. git branch develop
  5. Push initial structure to main (setup permission required).
  6. Set develop as the default working branch for all agent sessions.

After initial setup, Claude Code returns to the standard permission
model — no pushes to main without explicit per-session owner instruction.

Claude Code must read the existing GitHub repository for a project at
the start of any session where implementation work is planned. This
ensures agent output builds on what already exists rather than
duplicating or conflicting with prior work. Reading GitHub history
requires no special permission — it is always permitted.

---

## SECTION 3 — IDE GOVERNANCE ACROSS THE ECOSYSTEM

All projects use the same three-IDE architecture from Tier 1 Section 5.
This section adds the recommended build sequence for new agent projects.

When starting a new agent project in this ecosystem:

  Step 1 — Claude.ai: Define the agent's specification, architecture,
    and role within the ecosystem. Write the Tier 3 CLAUDE.md.
    Make all major decisions before any implementation begins.

  Step 2 — GitHub: Create the private repository. Claude Code initialises
    the repo structure with owner permission for the setup push to main.

  Step 3 — Cloudflare + Wrangler: Create the project's Worker and store
    required secrets before writing any code that depends on them.

  Step 4 — Antigravity Manager View: Scaffold non-sensitive modules in
    parallel on their respective feature branches. Auth patterns, UI
    scaffolding, API adapter shells, deployment configuration.

  Step 5 — Cursor Pro: Implement all proprietary or IP-sensitive logic
    locally on its feature branch. Never in Antigravity.

  Step 6 — Claude Code: Review the full build for architectural
    consistency, security compliance, secret hygiene, and CLAUDE.md
    alignment. Run pre-commit secret scan. Prompt owner to commit.

  Step 7 — Update this file: Add the new project to Section 1 and
    document any planned integrations in Section 5.

---

## SECTION 4 — SECRET MANAGEMENT AT THE ECOSYSTEM LEVEL

All projects inherit the secret management rules from Tier 1 Section 3.
Every project uses the same architecture: Cloudflare Workers Secrets,
delivery through deployed Workers, Wrangler CLI as the only write path.
This is a non-negotiable ecosystem standard.

Each project maintains its own separate set of Cloudflare Workers Secrets
scoped to that project's Workers. Secrets from one project do not cross
into another project's Workers unless a deliberate, owner-authorised
cross-Worker integration has been designed and documented in Section 5.

Antigravity sessions must never expose Worker secret binding names,
wrangler.toml contents, or secret architecture documentation to the
Antigravity agent. Keep these files closed when Antigravity is active.

---

## SECTION 5 — CROSS-AGENT COLLABORATION GOVERNANCE

Default state of every project: ISOLATED.
Collaboration requires explicit per-session owner authorisation naming
both projects, defining scope and direction, and Claude Code confirming
its understanding before acting. Permission expires at session end.

Cross-project collaboration involving Antigravity still observes IDE
routing rules. IP-sensitive logic in any project routes through Cursor
regardless of session context.

Cross-project secrets follow the Worker endpoint pattern. Secrets never
cross project boundaries directly.

Claude Code reads sibling project directories only when explicitly
instructed. It does not autonomously scan the ecosystem to inform its
output — it works with what is in scope for the current session unless
the owner explicitly expands that scope.

---

## SECTION 6 — FUTURE INTEGRATION ROADMAP

Documents planned cross-agent integrations. Claude Code uses this to
reason about future connections without being surprised mid-session.

# ---------------------------------------------------------------
# DOCUMENT PLANNED CROSS-AGENT CONNECTIONS HERE AS DECIDED.
# Format:
#   FTG-TKO <-> [project]: Purpose, interface, IDE routing, status.
# ---------------------------------------------------------------

---

## SECTION 7 — ECOSYSTEM ARCHITECTURAL PRINCIPLES

Every project must expose a clearly defined interface layer — documented
inputs and outputs — so future connections happen through clean contracts
rather than direct internal access. Build the interface before you know
whether you will use it.

Shared utilities that prove useful across projects must be flagged to
the owner rather than silently duplicated. The owner decides whether to
extract to a shared library or keep duplicated for isolation reasons.

No project hard-codes credentials anywhere. All sensitive values live in
Cloudflare Workers Secrets. Flag any credential heading toward a committed
file and stop immediately.

Git commit history is the invention timeline across the entire ecosystem.
Every significant decision in every project gets committed with a
descriptive message at the time it is made.

When Antigravity's quality degrades mid-session, stop that workstream,
switch to Cursor, and flag the output for review before merging anything
from the degraded session into develop or main.

---

*Update this file when new projects are added, cross-agent collaboration
is established, the build sequence for a project type changes, or
ecosystem-wide architectural decisions are made. Individual project
details belong in their Tier 3 CLAUDE.md files.*
