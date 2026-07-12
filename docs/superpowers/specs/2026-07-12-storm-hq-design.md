# Storm HQ — Design Spec

Date: 2026-07-12
Owner: Nick (shugogeta)
Status: Approved design, pending implementation plan
Home: New dedicated repo `storm-hq` (this spec lives in tko-agents until that repo is initialized, then migrates with it)

---

## 1. Purpose

Storm HQ is a local agent harness and headquarters: a cyberpunk-themed Tauri
desktop app from which the owner oversees all agent activity, dispatches new
missions, edits agent constitutions (`agent.md`), attaches skills and MCPs,
and manages automation. It runs in tandem with Cursor Pro and Antigravity —
it does not replace them.

It promotes five existing terminal aliases into full harness-managed agents,
adds a sixth coordinator persona (Legend), and uses the existing git worktree
mission slots for isolated execution.

## 2. Roster

| Persona  | Role                                   | Default model / route                                  | Runtime adapter |
|----------|----------------------------------------|--------------------------------------------------------|-----------------|
| Legend   | Conductor — head orchestration officer | Toggleable on command (any allowlisted model)          | claude-agent-sdk |
| Thor     | Deep-logic / core-IP apex              | claude-opus-4-8 · Vertex us-east5 (`thor-d` = direct)  | claude-agent-sdk |
| Sinbad   | Creative apex (highest creative authority) | claude-fable-5 · Vertex global (1M ctx / 128K out) | claude-agent-sdk |
| Yoruichi | Features / broad implementation        | claude-sonnet-5 · Vertex global (1M ctx)               | claude-agent-sdk |
| Kakashi  | Deep work via Cursor runtime           | Cursor API key (moving off `agy`)                      | cursor-sdk       |
| Killua   | Fast iteration / high volume           | Gemini 3.5 Flash via Antigravity CLI (`agy`)           | pty (legacy)     |

Also enabled on Vertex and part of the allowlist: claude-opus-4-7,
claude-opus-4-6, claude-haiku-4-5.

## 3. Authority model

### 3.1 Hierarchy

```
OWNER (you, via HQ)      — supreme authority: secrets, auth raises, protected merges
  └── LEGEND             — highest COORDINATION authority, capability ceiling
        ├── Thor, Sinbad — apex specialists (deep logic / creative)
        └── Yoruichi, Kakashi, Killua — specialists
```

Legend coordinates but cannot: raise any agent's authority, access secrets,
merge to protected branches, or widen its own scope. Those are owner gates.

### 3.2 Legend ceiling (hard enforcement)

No specialist profile may request a model, tool, auth tier, or MCP that is
not on Legend's allowlist (`allowlists/legend.json`). Enforcement is
two-layer:

1. **Spawn-time** — the daemon rejects profile saves and session spawns whose
   effective config exceeds the allowlist.
2. **Runtime** — every SDK session is started with daemon-registered
   `PreToolUse` hooks; tool calls outside the profile's authority matrix are
   denied live (`permissionDecision: "deny"` with reason). Cursor sessions
   get the equivalent via Cursor hooks.

Allowlist seeds: all roster default models plus opus-4-7, opus-4-6,
haiku-4-5, plus every entry added to the shared MCP library (auto-seeded).
Adding a new model/tool/MCP to any specialist requires putting it on
Legend's allowlist first. Widening the allowlist is an owner-gated action.

### 3.3 Per-profile authority matrix (composable)

Each profile carries:

- **Path scope** — project root + writable paths (normally its mission slot)
- **Capability tier** — read → write → git → deploy; mapped to SDK
  permission modes (`plan` for read-only recon, `default`/`acceptEdits` for
  trusted execution, `dontAsk` for locked-down runs) plus
  `allowedTools`/`disallowedTools`
- **Approval gates** — which actions auto-run vs require owner confirm

## 4. Personas and profiles (identity model)

- A **persona** is the stable identity (name, voice, hard limits): Legend,
  Thor, Sinbad, Yoruichi, Kakashi, Killua.
- A **profile** binds a persona to a context:
  `profiles/<persona>.<context>/agent.md` — e.g. `thor.ftg-tko`,
  `legend.default`, later `thor.raijin` (trading-results analysis and ROI
  strategy recommendations inside RaijinXSusanoo).
- Profiles are independently created, edited, versioned, and recreated by
  the owner at will. Creating `thor.raijin` never touches `thor.ftg-tko`.
- Every profile has adjustable skill packs and MCP attachments.

## 5. Architecture

Approach: **daemon + adapters** (Tauri 2 shell).

```
┌────────────────────────────────────────────────┐
│ Storm HQ (Tauri 2, cyberpunk UI)               │
│  roster · Legend bar · brief composer ·        │
│  slot board · session panes · editors          │
└───────────────┬────────────────────────────────┘
                │ IPC / WS
┌───────────────▼────────────────────────────────┐
│ Harness daemon (TypeScript / Node, sidecar)    │
│  registry · ceiling enforcer · dispatcher ·    │
│  telemetry bus (SQLite WAL) · skill/MCP        │
│  resolvers · hook server                       │
└───┬───────────────┬───────────────┬────────────┘
    ▼               ▼               ▼
claude-agent-sdk  cursor-sdk      pty adapter
(Thor/Yoruichi/   (Kakashi)       (Killua / agy)
 Sinbad/Legend)
    │               │               │
    └───────────────┴───────────────┘
          cwd = ~/FTG-TKO-missions/slot-{1..6}
```

Key decisions:

- **Daemon is a separate sidecar process**, not in-UI — missions survive
  cockpit restarts. Sessions are resumable (Claude session IDs, Cursor
  `Agent.resume`).
- **Daemon language: TypeScript** — both primary SDKs are TS-first.
- **Adapters use SDKs, not PTY scraping**, except Killua (no `agy` SDK).
  Claude sessions run with controlled `settingSources` so only
  HQ-injected config loads (no stray `~/.claude` hooks or project MCPs).
- Existing zsh env routing (Vertex project/region vars, direct-key
  fallbacks) is reproduced by the daemon per profile; aliases remain usable
  outside Storm HQ.

## 6. On-disk layout (repo `storm-hq`)

```
storm-hq/
  app/                      # Tauri 2 shell + UI
  daemon/                   # TS harness daemon (sidecar)
  personas/<name>/          # persona base identity docs
  profiles/<persona>.<ctx>/ # agent.md + skills + MCP attach + authority matrix
  skills/                   # attachable skill packs
  mcp-library/              # shared MCP catalog (.mcp.json schema per entry)
  allowlists/legend.json    # hard ceiling: models, tools, auth tiers, MCPs
  missions/                 # mission records; slots point at ~/FTG-TKO-missions
```

## 7. Skills and MCP resolution

Merge order for a session's effective config:

1. **Shared library** (Storm-wide skills / `mcp-library/` defaults)
2. **Persona/profile config** (per-agent MCPs and skills — existing alias
   configs carry over here)
3. **Session attach** (one-off adds from HQ at dispatch time)

Shared-library MCP entries use the standard `.mcp.json` schema so one entry
serves both Claude Code and Cursor SDK sessions. Everything resolved must
still pass the Legend ceiling.

## 8. Data flow (mission lifecycle)

1. **Initiate/edit** — owner creates or rewrites a profile's `agent.md`,
   attaches skills/MCPs. Daemon validates against ceiling before activation.
2. **Brief in** — HQ sends a brief to Legend (or directly to a specialist).
3. **Plan** — Legend (on whichever model is currently toggled) returns a
   **structured JSON mission plan**: persona, profile, slot, skills/MCPs.
   v1 default: owner approves before dispatch.
4. **Dispatch** — daemon claims a slot, materializes effective config,
   re-checks ceiling, starts the adapter with `cwd` = slot worktree and
   runtime hooks registered.
5. **Execute/observe** — normalized events stream to the telemetry bus
   (SQLite) and Session pane. Owner can pause, re-prompt (session resume,
   not restart), stop, or ask Legend to revise.
6. **Complete** — session exits; slot frees (or is pinned); mission summary
   recorded. Merges to protected branches remain owner-gated, outside
   auto-dispatch.
7. **Re-home** — new profiles bind personas to new roots (e.g.
   `thor.raijin`) without disturbing existing profiles.

Legend model toggle: takes effect at the next turn boundary; every switch is
logged to telemetry. In v1 Legend runs on the claude-agent-sdk adapter, so
the toggle covers the full allowlisted Claude family on Vertex (opus-4-8,
opus-4-7, opus-4-6, sonnet-5, fable-5, haiku-4-5). Toggling Legend onto
Gemini (AGY route) or Cursor-routed models requires those adapters to host
Legend and is deferred past v1; both stay on the allowlist as specialist
routes and remain part of the ceiling.

## 9. Error handling and safety

- **Ceiling violations** — blocked at save/spawn; runtime tool calls denied
  by hooks. HQ shows exactly what was blocked and why; fix path is the
  Legend allowlist (owner-gated).
- **Adapter/process failures** — spawn failure, crash, or error exit marks
  the session `failed`; slot released unless pinned; error + recent events
  shown. Startup failures are distinguished from mid-run failures (e.g.
  thrown `CursorAgentError` vs `result.status === "error"`). No auto-restart
  in v1.
- **Stuck sessions** — heartbeat timeout marks `stale`; owner chooses
  pause/stop/re-prompt. No silent kills in v1.
- **Partial plans** — if one leg of a Legend plan fails the ceiling check,
  only that leg aborts; HQ highlights the illegal item.
- **Secrets** — never in `agent.md`, profiles, mission records, or the
  committed MCP library. Daemon reads from OS keychain / existing env
  patterns (Vertex vars, `ANTHROPIC_DIRECT_KEY`, `CURSOR_API_KEY`). UI shows
  configured/missing status only. Logs and summaries are scrubbed.
- **Owner gates** — protected merges, auth raises, allowlist widening →
  explicit confirm in HQ.

## 10. v1 scope (first vertical slice)

**Ships:** cockpit + dispatch + telemetry.

- Cyberpunk cockpit: roster (Legend + 5), Legend model toggle, brief
  composer, slot board, live session panes (pause / re-prompt / stop)
- Profile system: `agent.md` editor with versioning, skill attach/detach,
  MCP attach (shared library + profile)
- Daemon: registry, two-layer ceiling enforcement, dispatcher, SQLite
  telemetry, hook server
- Adapters: claude-agent-sdk, cursor-sdk, pty (agy)

**Deferred:** deep IDE panes (Monaco editor, file tree, integrated
terminal), automation loops (cron/heartbeat missions), auto-approve
policies, Raijin profiles, multi-repo mission slots beyond FTG-TKO.

## 11. Testing

- **Unit (daemon)** — ceiling enforcer (legal vs illegal model/MCP/auth
  combos); config merge order; profile registry independence
  (`thor.ftg-tko` vs `thor.raijin`).
- **Adapter contract tests** — stub adapters emitting SDK-shaped event
  fixtures; dispatcher maps persona → adapter → slot `cwd` correctly. Real
  CLI/SDK smoke tests manual, behind a flag.
- **UI** — roster, slot board, Legend toggle, brief → approve → dispatch
  happy path; fixture telemetry replay into the Session pane.
- **Integration (local)** — daemon + stub adapter + UI: brief → plan
  fixture → approve → slot claim → events → stop → slot free.
- **Safety regression** — spawn with non-allowlisted model must fail;
  attach non-allowlisted MCP must fail; runtime hook denies out-of-matrix
  tool call; secrets never appear in logs or mission records.

## 12. Decisions log

| Decision | Choice |
|---|---|
| Product identity | Storm HQ, new dedicated repo |
| Shell | Tauri 2 (daemon as TS sidecar) |
| Harness pattern | Daemon + adapters |
| Identity model | Persona + named profiles |
| Authority | Composable matrix (path scope + capability tier + approval gates) |
| Ceiling | Hard enforcement, two-layer (spawn + runtime hooks) |
| Conductor | Legend — multi-model, toggleable on command, coordination-only authority |
| Sinbad | Highest creative authority |
| Thor | Deep-logic / core-IP apex |
| MCP | Shared library + per-profile configs, merge order shared → profile → session |
| Mission isolation | `~/FTG-TKO-missions/slot-{1..6}` worktrees |
| v1 slice | Cockpit + dispatch + telemetry |
