# Storm HQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Storm HQ v1 — a local Tauri 2 cyberpunk headquarters with a TypeScript harness daemon that manages Legend + five specialist personas, enforces the Legend allowlist ceiling, dispatches missions to git worktree slots, and streams telemetry.

**Architecture:** Tauri 2 UI talks to a Node/TS sidecar daemon over localhost WebSocket + REST. The daemon owns registry, ceiling enforcement, config merge, dispatch, and SQLite telemetry. Runtime adapters wrap Claude Agent SDK, Cursor SDK, and a PTY wrapper for Killua (`agy`).

**Tech Stack:** Tauri 2, React 19, TypeScript, Vite, Vitest, better-sqlite3, `@anthropic-ai/claude-agent-sdk`, `@cursor/sdk`, node-pty (Killua), zod (schemas).

**Spec:** `docs/superpowers/specs/2026-07-12-storm-hq-design.md` (migrate into repo on init)

**Mission slots (existing):** `~/FTG-TKO-missions/slot-{1..6}` → FTG-TKO worktrees

**Homes (locked):**
- Local: `/Users/shugogeta/storm-hq` (`~/storm-hq`)
- GitHub: `QuantPhizz/Storm-HQ` (private; create/push is owner-gated)

---

## File map (repo `storm-hq`)

```
storm-hq/
  package.json                         # npm workspaces root
  tsconfig.base.json
  CLAUDE.md                            # Tier 3 project constitution
  .gitignore
  allowlists/legend.json               # hard ceiling seed
  personas/<name>/persona.md           # stable identity (6 personas)
  profiles/<persona>.<ctx>/
    agent.md
    authority.json                     # path scope, tier, gates
    skills.json                        # attached skill ids
    mcps.json                          # profile MCP refs
  skills/<id>/SKILL.md
  mcp-library/<id>.mcp.json
  packages/shared/                     # types + schemas + constants
  daemon/                              # harness sidecar
  app/                                 # Tauri 2 + React cockpit
```

---

## Phase 0 — Repository bootstrap

### Task 0: Initialize `storm-hq` repo

**Files:**
- Create: `~/storm-hq/` (or owner-preferred path outside nested tko-agents projects)
- Create: `storm-hq/package.json`, `storm-hq/.gitignore`, `storm-hq/CLAUDE.md`, `storm-hq/README.md`
- Copy: design spec → `storm-hq/docs/specs/2026-07-12-storm-hq-design.md`

- [ ] **Step 1: Create repo directory and git init**

```bash
mkdir -p ~/storm-hq/docs/specs
cd ~/storm-hq
git init
git checkout -b develop
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "storm-hq",
  "private": true,
  "workspaces": ["packages/shared", "daemon", "app"],
  "scripts": {
    "test": "npm run test -w daemon && npm run test -w packages/shared",
    "dev:daemon": "npm run dev -w daemon",
    "dev:app": "npm run tauri dev -w app",
    "build": "npm run build -w packages/shared && npm run build -w daemon && npm run build -w app"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
target/
.env
.env.*
!.env.example
.superpowers/
*.db
*.db-wal
*.db-shm
.DS_Store
app/src-tauri/gen/
```

- [ ] **Step 4: Write Tier 3 `CLAUDE.md`** (project scope: Storm HQ only; secrets via env/keychain; owner gates for allowlist widen + protected merges; isolated from FTG-TKO/Raijin unless profile explicitly re-homed)

- [ ] **Step 5: Copy design spec; commit**

```bash
cp ~/tko-agents/docs/superpowers/specs/2026-07-12-storm-hq-design.md docs/specs/
git add .
git commit -m "chore: initialize Storm HQ repo scaffold"
```

> Owner action later: create private GitHub repo `storm-hq`, push `main` + `develop` per ecosystem Git conventions.

---

## Phase 1 — Shared types & allowlist seed

### Task 1: Shared package + Zod schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/vitest.config.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Write failing schema test**

```typescript
// packages/shared/src/schemas.test.ts
import { describe, it, expect } from "vitest";
import { LegendAllowlistSchema, ProfileAuthoritySchema } from "./schemas";

describe("LegendAllowlistSchema", () => {
  it("accepts seeded models including grok-4-5 cursor route", () => {
    const data = {
      models: [
        { id: "claude-opus-4-8", route: "vertex", region: "us-east5" },
        { id: "grok-4-5", route: "cursor" },
      ],
      tools: ["Read", "Edit", "Bash"],
      authTiers: ["read", "write", "git"],
      mcps: ["linear"],
    };
    expect(LegendAllowlistSchema.parse(data).models).toHaveLength(2);
  });
});

describe("ProfileAuthoritySchema", () => {
  it("requires pathScope and capabilityTier", () => {
    expect(() =>
      ProfileAuthoritySchema.parse({ capabilityTier: "write" })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd ~/storm-hq/packages/shared && npm install vitest zod --save-dev && npx vitest run
```

- [ ] **Step 3: Implement schemas**

```typescript
// packages/shared/src/schemas.ts
import { z } from "zod";

export const ModelRouteSchema = z.enum(["vertex", "direct", "cursor", "antigravity"]);

export const ModelEntrySchema = z.object({
  id: z.string(),
  route: ModelRouteSchema,
  region: z.string().optional(),
});

export const LegendAllowlistSchema = z.object({
  models: z.array(ModelEntrySchema),
  tools: z.array(z.string()),
  authTiers: z.array(z.enum(["read", "write", "git", "deploy", "secrets"])),
  mcps: z.array(z.string()),
});

export const ProfileAuthoritySchema = z.object({
  pathScope: z.object({
    root: z.string(),
    writable: z.array(z.string()),
  }),
  capabilityTier: z.enum(["read", "write", "git", "deploy"]),
  permissionMode: z.enum(["plan", "default", "acceptEdits", "dontAsk"]).default("default"),
  allowedTools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  approvalGates: z.object({
    mergeProtected: z.literal(true).default(true),
    widenAllowlist: z.literal(true).default(true),
  }),
});

export const MissionPlanSchema = z.object({
  persona: z.string(),
  profileId: z.string(),
  slot: z.number().int().min(1).max(6),
  brief: z.string(),
  skills: z.array(z.string()).default([]),
  mcps: z.array(z.string()).default([]),
});

export type LegendAllowlist = z.infer<typeof LegendAllowlistSchema>;
export type ProfileAuthority = z.infer<typeof ProfileAuthoritySchema>;
export type MissionPlan = z.infer<typeof MissionPlanSchema>;
```

```typescript
// packages/shared/src/index.ts
export * from "./schemas";
export * from "./personas";
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Zod schemas for allowlist, authority, mission plan"
```

### Task 2: Seed `allowlists/legend.json` + persona constants

**Files:**
- Create: `allowlists/legend.json`
- Create: `packages/shared/src/personas.ts`
- Test: `packages/shared/src/personas.test.ts`

- [ ] **Step 1: Write allowlist seed**

```json
{
  "models": [
    { "id": "claude-opus-4-8", "route": "vertex", "region": "us-east5" },
    { "id": "claude-opus-4-7", "route": "vertex", "region": "us-east5" },
    { "id": "claude-opus-4-6", "route": "vertex", "region": "us-east5" },
    { "id": "claude-sonnet-5", "route": "vertex", "region": "global" },
    { "id": "claude-sonnet-4-6", "route": "vertex", "region": "us-east5" },
    { "id": "claude-fable-5", "route": "vertex", "region": "global" },
    { "id": "claude-haiku-4-5", "route": "vertex", "region": "us-east5" },
    { "id": "grok-4-5", "route": "cursor" },
    { "id": "gemini-3.5-flash", "route": "antigravity" }
  ],
  "tools": ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch", "WebSearch"],
  "authTiers": ["read", "write", "git", "deploy"],
  "mcps": []
}
```

- [ ] **Step 2: Write persona registry constants**

```typescript
// packages/shared/src/personas.ts
export const PERSONAS = [
  { id: "legend", adapter: "claude-agent-sdk", defaultModel: "claude-fable-5" },
  { id: "thor", adapter: "claude-agent-sdk", defaultModel: "claude-opus-4-8" },
  { id: "sinbad", adapter: "claude-agent-sdk", defaultModel: "claude-fable-5" },
  { id: "yoruichi", adapter: "claude-agent-sdk", defaultModel: "claude-sonnet-5" },
  { id: "kakashi", adapter: "cursor-sdk", defaultModel: "grok-4-5" },
  { id: "killua", adapter: "pty", defaultModel: "gemini-3.5-flash" },
] as const;

export type PersonaId = (typeof PERSONAS)[number]["id"];
export type AdapterKind = "claude-agent-sdk" | "cursor-sdk" | "pty";

export const MISSION_SLOTS = [1, 2, 3, 4, 5, 6] as const;
export const SLOT_ROOT = (n: number) =>
  `${process.env.HOME}/FTG-TKO-missions/slot-${n}`;
```

- [ ] **Step 3: Test + commit**

```bash
npx vitest run && git add allowlists packages/shared && git commit -m "feat: seed Legend allowlist and persona registry"
```

---

## Phase 2 — Ceiling enforcer & profile registry

### Task 3: Ceiling enforcer (spawn-time)

**Files:**
- Create: `daemon/package.json`, `daemon/tsconfig.json`, `daemon/vitest.config.ts`
- Create: `daemon/src/ceiling/enforcer.ts`
- Test: `daemon/src/ceiling/enforcer.test.ts`

- [ ] **Step 1: Failing test — illegal model rejected**

```typescript
// daemon/src/ceiling/enforcer.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { CeilingEnforcer } from "./enforcer";
import type { LegendAllowlist } from "@storm-hq/shared";

const allowlist: LegendAllowlist = {
  models: [{ id: "claude-opus-4-8", route: "vertex", region: "us-east5" }],
  tools: ["Read"],
  authTiers: ["read", "write"],
  mcps: [],
};

describe("CeilingEnforcer", () => {
  let enforcer: CeilingEnforcer;
  beforeEach(() => { enforcer = new CeilingEnforcer(allowlist); });

  it("allows allowlisted model", () => {
    expect(enforcer.checkModel("claude-opus-4-8")).toEqual({ ok: true });
  });

  it("denies non-allowlisted model with reason", () => {
    const r = enforcer.checkModel("claude-opus-5-unknown");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not on Legend allowlist/);
  });

  it("denies MCP not on allowlist", () => {
    const r = enforcer.checkMcp("secret-server");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement enforcer**

```typescript
// daemon/src/ceiling/enforcer.ts
import type { LegendAllowlist, ProfileAuthority } from "@storm-hq/shared";

export type CheckResult = { ok: true } | { ok: false; reason: string };

export class CeilingEnforcer {
  constructor(private allowlist: LegendAllowlist) {}

  checkModel(modelId: string): CheckResult {
    if (this.allowlist.models.some((m) => m.id === modelId)) return { ok: true };
    return { ok: false, reason: `Model "${modelId}" is not on Legend allowlist` };
  }

  checkMcp(mcpId: string): CheckResult {
    if (this.allowlist.mcps.includes(mcpId)) return { ok: true };
    return { ok: false, reason: `MCP "${mcpId}" is not on Legend allowlist` };
  }

  checkAuthTier(tier: ProfileAuthority["capabilityTier"]): CheckResult {
    if (this.allowlist.authTiers.includes(tier)) return { ok: true };
    return { ok: false, reason: `Auth tier "${tier}" exceeds Legend ceiling` };
  }

  checkTools(tools: string[]): CheckResult {
    for (const t of tools) {
      if (!this.allowlist.tools.includes(t)) {
        return { ok: false, reason: `Tool "${t}" is not on Legend allowlist` };
      }
    }
    return { ok: true };
  }

  validateProfileConfig(input: {
    modelId: string;
    authority: ProfileAuthority;
    mcps: string[];
    tools: string[];
  }): CheckResult {
    const checks = [
      this.checkModel(input.modelId),
      this.checkAuthTier(input.authority.capabilityTier),
      this.checkTools(input.tools),
      ...input.mcps.map((m) => this.checkMcp(m)),
    ];
    return checks.find((c) => !c.ok) ?? { ok: true };
  }
}

- [ ] **Step 3: Run tests, commit**

```bash
cd ~/storm-hq/daemon && npm install && npx vitest run
git commit -am "feat(daemon): spawn-time Legend ceiling enforcer"
```

### Task 4: Profile registry

**Files:**
- Create: `daemon/src/registry/profile-registry.ts`
- Create: `profiles/legend.default/agent.md` (+ authority.json, skills.json, mcps.json)
- Create: initial profiles for `thor.ftg-tko`, `sinbad.ftg-tko`, `yoruichi.ftg-tko`, `kakashi.ftg-tko`, `killua.ftg-tko`
- Test: `daemon/src/registry/profile-registry.test.ts`

- [ ] **Step 1: Profile folder template**

`profiles/<id>/agent.md` — use existing tko-agents `agents/_template/agent.md` structure extended with Persona, ProfileId, DefaultModel, Adapter fields.

`profiles/<id>/authority.json` example for `thor.ftg-tko`:

```json
{
  "pathScope": {
    "root": "~/FTG-TKO-missions/slot-1",
    "writable": ["."]
  },
  "capabilityTier": "git",
  "permissionMode": "acceptEdits",
  "allowedTools": ["Read", "Edit", "Glob", "Grep", "Bash"],
  "disallowedTools": [],
  "approvalGates": { "mergeProtected": true, "widenAllowlist": true }
}
```

- [ ] **Step 2: Implement ProfileRegistry**

```typescript
// daemon/src/registry/profile-registry.ts
import fs from "node:fs/promises";
import path from "node:path";
import { ProfileAuthoritySchema } from "@storm-hq/shared";

export type ProfileRecord = {
  id: string;
  persona: string;
  agentMd: string;
  authority: ReturnType<typeof ProfileAuthoritySchema.parse>;
  skills: string[];
  mcps: string[];
  modelId: string;
};

export class ProfileRegistry {
  constructor(private profilesDir: string) {}

  async load(profileId: string): Promise<ProfileRecord> {
    const dir = path.join(this.profilesDir, profileId);
    const [agentMd, authorityRaw, skillsRaw, mcpsRaw] = await Promise.all([
      fs.readFile(path.join(dir, "agent.md"), "utf8"),
      fs.readFile(path.join(dir, "authority.json"), "utf8"),
      fs.readFile(path.join(dir, "skills.json"), "utf8"),
      fs.readFile(path.join(dir, "mcps.json"), "utf8"),
    ]);
    const authority = ProfileAuthoritySchema.parse(JSON.parse(authorityRaw));
    const modelMatch = agentMd.match(/^DefaultModel:\s*(.+)$/m);
    const personaMatch = agentMd.match(/^Persona:\s*(.+)$/m);
    return {
      id: profileId,
      persona: personaMatch?.[1]?.trim() ?? profileId.split(".")[0],
      agentMd,
      authority,
      skills: JSON.parse(skillsRaw).attached ?? [],
      mcps: JSON.parse(mcpsRaw).attached ?? [],
      modelId: modelMatch?.[1]?.trim() ?? "",
    };
  }

  async list(): Promise<string[]> {
    const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }
}
```

- [ ] **Step 3: Test independence `thor.ftg-tko` vs future `thor.raijin`**

```typescript
it("loads profiles independently by id", async () => {
  const reg = new ProfileRegistry(fixturesDir);
  const a = await reg.load("thor.ftg-tko");
  expect(a.persona).toBe("thor");
  await expect(reg.load("thor.raijin")).rejects.toThrow(); // until created
});
```

- [ ] **Step 4: Commit all seed profiles**

---

## Phase 3 — Config resolver (skills + MCP merge)

### Task 5: Skill/MCP resolver

**Files:**
- Create: `daemon/src/resolver/config-resolver.ts`
- Create: `mcp-library/.gitkeep` + one example `mcp-library/linear.mcp.json`
- Test: `daemon/src/resolver/config-resolver.test.ts`

- [ ] **Step 1: Failing merge-order test**

```typescript
it("merges shared → profile → session mcps in order", () => {
  const resolved = resolver.resolveMcps({
    shared: ["linear"],
    profile: ["cloudflare"],
    session: ["linear"],
  });
  expect(resolved).toEqual(["linear", "cloudflare"]);
});
```

- [ ] **Step 2: Implement resolver** (dedupe by id, preserve order shared → profile → session)

- [ ] **Step 3: Pass resolved config through CeilingEnforcer before return**

- [ ] **Step 4: Commit**

---

## Phase 4 — Telemetry (SQLite WAL)

### Task 6: Telemetry store

**Files:**
- Create: `daemon/src/telemetry/store.ts`
- Create: `daemon/src/telemetry/events.ts`
- Test: `daemon/src/telemetry/store.test.ts`

- [ ] **Step 1: Define normalized event types**

```typescript
// daemon/src/telemetry/events.ts
export type SessionEvent =
  | { type: "session.started"; sessionId: string; persona: string; slot: number; ts: number }
  | { type: "session.message"; sessionId: string; role: "user" | "assistant"; text: string; ts: number }
  | { type: "session.tool_call"; sessionId: string; tool: string; allowed: boolean; ts: number }
  | { type: "session.model_switch"; sessionId: string; modelId: string; ts: number }
  | { type: "session.exited"; sessionId: string; status: "finished" | "failed" | "stopped"; ts: number };
```

- [ ] **Step 2: Implement SQLite store** (`better-sqlite3`, WAL mode, tables: `missions`, `sessions`, `events`)

- [ ] **Step 3: Test append + query by sessionId**

- [ ] **Step 4: Commit**

---

## Phase 5 — Daemon API (REST + WebSocket)

### Task 7: HTTP/WS server

**Files:**
- Create: `daemon/src/server.ts`
- Create: `daemon/src/routes/profiles.ts`, `missions.ts`, `sessions.ts`, `allowlist.ts`
- Create: `daemon/src/index.ts`
- Test: `daemon/src/server.test.ts` (supertest)

**Endpoints (v1):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | daemon alive |
| GET | `/personas` | roster |
| GET | `/profiles` | list profile ids |
| GET | `/profiles/:id` | load profile |
| PUT | `/profiles/:id` | save agent.md / attachments (ceiling check) |
| GET | `/allowlist` | read Legend allowlist |
| PUT | `/allowlist` | owner-gated widen |
| POST | `/missions/plan` | send brief → Legend plan (JSON) |
| POST | `/missions/dispatch` | approve plan → spawn session |
| GET | `/slots` | slot occupancy |
| GET | `/sessions/:id/events` | telemetry stream history |
| WS | `/ws` | live session events |

- [ ] **Step 1: Boot express + ws on `127.0.0.1:9477` (configurable via `STORM_HQ_PORT`)**

- [ ] **Step 2: Wire ProfileRegistry + CeilingEnforcer on PUT routes**

- [ ] **Step 3: Integration test: PUT profile with illegal model → 400**

- [ ] **Step 4: Commit**

---

## Phase 6 — Adapters

### Task 8: Adapter interface + stub

**Files:**
- Create: `daemon/src/adapters/types.ts`
- Create: `daemon/src/adapters/stub.ts`
- Test: `daemon/src/adapters/stub.test.ts`

```typescript
// daemon/src/adapters/types.ts
import type { SessionEvent } from "../telemetry/events";
import type { ProfileRecord } from "../registry/profile-registry";

export type AdapterSession = {
  sessionId: string;
  send(prompt: string): Promise<void>;
  stop(): Promise<void>;
  onEvent(cb: (e: SessionEvent) => void): void;
};

export interface RuntimeAdapter {
  kind: "claude-agent-sdk" | "cursor-sdk" | "pty";
  start(input: {
    profile: ProfileRecord;
    slotCwd: string;
    modelId: string;
    env: Record<string, string>;
  }): Promise<AdapterSession>;
}
```

- [ ] **Step 1: Stub emits scripted events for integration tests**

- [ ] **Step 2: Commit**

### Task 9: Claude Agent SDK adapter

**Files:**
- Create: `daemon/src/adapters/claude.ts`
- Create: `daemon/src/adapters/claude-env.ts` (Vertex region/project mapping per persona)
- Test: `daemon/src/adapters/claude.test.ts` (mock SDK; real smoke behind `STORM_HQ_LIVE=1`)

- [ ] **Step 1: Map persona → env** (reproduce zshrc: Thor us-east5, Yoruichi/Sinbad global, direct-key fallback flag)

- [ ] **Step 2: Start session with `settingSources: []`, inject profile agent.md as system context**

- [ ] **Step 3: Register `PreToolUse` hook → deny tools outside profile authority + emit `session.tool_call`**

- [ ] **Step 4: Stream SDK messages → normalized SessionEvents**

- [ ] **Step 5: Support resume via stored Claude session id in SQLite**

- [ ] **Step 6: Commit**

### Task 10: Cursor SDK adapter (Kakashi + grok-4-5)

**Files:**
- Create: `daemon/src/adapters/cursor.ts`
- Test: `daemon/src/adapters/cursor.test.ts`

- [ ] **Step 1: `Agent.create` with `local: { cwd: slotCwd, settingSources: [] }`, model from profile**

- [ ] **Step 2: Grok 4.5 effort via Cursor model params (not separate allowlist rows)**

- [ ] **Step 3: Distinguish `CursorAgentError` (startup) vs `result.status === "error"` (mid-run)**

- [ ] **Step 4: Stream `run.stream()` → SessionEvents; `Agent.resume` for re-prompt**

- [ ] **Step 5: Commit**

### Task 11: PTY adapter (Killua / agy)

**Files:**
- Create: `daemon/src/adapters/pty.ts`
- Test: `daemon/src/adapters/pty.test.ts`

- [ ] **Step 1: Spawn `agy` in slot cwd with injected brief as initial stdin**

- [ ] **Step 2: Tail stdout/stderr → `session.message` events (best-effort parsing)**

- [ ] **Step 3: Commit** (document limitations vs SDK adapters in README)

---

## Phase 7 — Dispatcher & slot manager

### Task 12: Slot manager + dispatcher

**Files:**
- Create: `daemon/src/dispatch/slot-manager.ts`
- Create: `daemon/src/dispatch/dispatcher.ts`
- Test: `daemon/src/dispatch/dispatcher.test.ts`

- [ ] **Step 1: SlotManager tracks 1–6, reads git worktree path from `SLOT_ROOT(n)`**

- [ ] **Step 2: claim(slot) / release(slot) / pin(slot)**

- [ ] **Step 3: Dispatcher.selectAdapter(persona) → stub | claude | cursor | pty**

- [ ] **Step 4: dispatch(plan) flow:**
  1. resolve config (Task 5)
  2. ceiling check (Task 3)
  3. claim slot
  4. start adapter
  5. record mission + session in telemetry

- [ ] **Step 5: Test full happy path with stub adapter**

- [ ] **Step 6: Commit**

### Task 13: Legend planner (structured JSON)

**Files:**
- Create: `daemon/src/planner/legend-planner.ts`
- Create: `daemon/src/planner/plan-schema.json`
- Test: `daemon/src/planner/legend-planner.test.ts`

- [ ] **Step 1: Legend session uses toggled model from HQ state (stored in daemon memory + SQLite)**

- [ ] **Step 2: Prompt Legend with roster + slot availability → parse `MissionPlanSchema`**

- [ ] **Step 3: Validate each plan leg through CeilingEnforcer before returning to UI**

- [ ] **Step 4: Commit**

---

## Phase 8 — Tauri shell + sidecar lifecycle

### Task 14: Scaffold Tauri 2 app

**Files:**
- Create: `app/` via `npm create tauri-app@latest` (React + TypeScript + Vite)
- Modify: `app/src-tauri/tauri.conf.json` — bundle sidecar
- Create: `app/src-tauri/src/daemon.rs` — spawn/kill daemon sidecar

- [ ] **Step 1: Create Tauri app in `app/` workspace**

```bash
cd ~/storm-hq
npm create tauri-app@latest app -- --template react-ts
```

- [ ] **Step 2: Configure sidecar** in `tauri.conf.json`:

```json
"bundle": {
  "externalBin": ["bin/storm-hq-daemon"]
}
```

Build script copies `daemon/dist/index.js` → packaged binary wrapper (or use `tauri-plugin-shell` to spawn `node daemon/dist/index.js` in dev).

- [ ] **Step 3: On app start:** spawn daemon if `/health` unreachable; on app quit optionally leave daemon running (user preference, default: keep alive)

- [ ] **Step 4: Commit**

---

## Phase 9 — Cyberpunk cockpit UI (v1 slice)

### Task 15: Design tokens + layout shell

**Files:**
- Create: `app/src/styles/storm-theme.css`
- Create: `app/src/components/Layout.tsx`

**Palette (cyberpunk):**
- `--storm-bg: #0a0e17`
- `--storm-panel: #121a2a`
- `--storm-neon-cyan: #00f0ff`
- `--storm-neon-magenta: #ff2ea6`
- `--storm-neon-amber: #ffb020`
- `--storm-text: #e8ecf4`
- `--storm-dim: #6b7894`

- [ ] **Step 1: CSS variables + scanline/grid background + monospace accents**

- [ ] **Step 2: Three-column layout: Roster | Main (brief/slots/sessions) | Inspector (profile editor)**

- [ ] **Step 3: Commit**

### Task 16: Roster + Legend model toggle

**Files:**
- Create: `app/src/components/Roster.tsx`
- Create: `app/src/components/LegendBar.tsx`
- Create: `app/src/hooks/useDaemon.ts`

- [ ] **Step 1: Fetch `/personas` + active sessions from daemon**

- [ ] **Step 2: LegendBar dropdown: all allowlisted Claude models (v1); store selection via `PUT /sessions/legend/model` or daemon state endpoint**

- [ ] **Step 3: Show persona status badges: idle | planning | running | failed | stale**

- [ ] **Step 4: Commit**

### Task 17: Slot board + brief composer

**Files:**
- Create: `app/src/components/SlotBoard.tsx`
- Create: `app/src/components/BriefComposer.tsx`

- [ ] **Step 1: SlotBoard — 6 cells, show persona/profile/branch if occupied**

- [ ] **Step 2: BriefComposer → POST `/missions/plan` → show structured plan JSON**

- [ ] **Step 3: Approve button → POST `/missions/dispatch`**

- [ ] **Step 4: Commit**

### Task 18: Session pane + WebSocket telemetry

**Files:**
- Create: `app/src/components/SessionPane.tsx`
- Create: `app/src/hooks/useSessionStream.ts`

- [ ] **Step 1: Connect WS `/ws`, filter by sessionId**

- [ ] **Step 2: Render message + tool_call events; highlight denied tools in magenta**

- [ ] **Step 3: Pause / re-prompt / stop buttons → daemon session control endpoints**

- [ ] **Step 4: Commit**

### Task 19: Profile + skill/MCP editors

**Files:**
- Create: `app/src/components/ProfileEditor.tsx`
- Create: `app/src/components/McpLibrary.tsx`
- Create: `app/src/components/SkillAttach.tsx`

- [ ] **Step 1: Load/save `agent.md` via GET/PUT `/profiles/:id`**

- [ ] **Step 2: Attach skills from `skills/` catalog; MCPs from shared library + profile**

- [ ] **Step 3: Surface ceiling violation errors inline (model/MCP/tool blocked)**

- [ ] **Step 4: Commit**

---

## Phase 10 — Integration & smoke

### Task 20: End-to-end integration test

**Files:**
- Create: `daemon/src/integration/happy-path.test.ts`

- [ ] **Step 1: Boot daemon with stub adapters only**

- [ ] **Step 2: Flow: brief → plan → approve → slot 3 claimed → events → stop → slot free**

- [ ] **Step 3: Safety: dispatch with `claude-opus-5-fake` → 400, slot unchanged**

- [ ] **Step 4: Commit**

### Task 21: Live smoke script (manual, optional)

**Files:**
- Create: `scripts/smoke-live.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
export STORM_HQ_LIVE=1
npm run dev:daemon &
sleep 2
curl -sf http://127.0.0.1:9477/health
# Owner: run one Thor session in slot-6 with a trivial brief
```

- [ ] **Step 1: Document in README; do not run in CI**

- [ ] **Step 2: Commit**

### Task 22: Register Storm HQ in ecosystem

**Files:**
- Modify: `~/tko-agents/CLAUDE.md` Section 1 — add Storm HQ entry (after owner creates GitHub repo)

- [ ] **Step 1: Add project listing + note mission slot dependency on FTG-TKO worktrees**

- [ ] **Step 2: Commit in tko-agents (separate repo)**

---

## Spec coverage checklist

| Spec requirement | Task(s) |
|---|---|
| Six personas + profiles | 2, 4 |
| Legend allowlist hard ceiling | 2, 3, 5, 7 |
| grok-4-5 cursor route | 2, 10 |
| sonnet-4-6 on allowlist | 2 |
| Persona + named profiles | 4 |
| Shared MCP library + merge | 5, 19 |
| Mission slots 1–6 | 2, 12 |
| Claude SDK adapters + hooks | 9 |
| Cursor SDK adapter | 10 |
| Killua PTY | 11 |
| SQLite telemetry | 6, 18 |
| Legend planner JSON | 13 |
| Owner gates (allowlist widen) | 7 |
| Tauri 2 shell | 14 |
| Cyberpunk cockpit v1 | 15–19 |
| Testing plan | 3–6, 8, 12, 20 |

**Deferred (explicitly out of v1 tasks):** Monaco IDE panes, automation loops/cron, Legend on Cursor/Gemini adapters, Raijin profiles, auto-approve policies.

---

## Suggested execution order

1. Phase 0–2 (repo, schemas, ceiling, profiles) — **foundation, no UI**
2. Phase 3–5 (resolver, telemetry, API) — **daemon usable via curl**
3. Phase 6–7 (adapters, dispatcher) — **real missions possible**
4. Phase 8–9 (Tauri + UI) — **HQ visible**
5. Phase 10 — **prove it**

Estimated: **~22 tasks**, 3–5 sessions depending on adapter polish.

---

## Environment variables (daemon)

| Variable | Purpose |
|---|---|
| `STORM_HQ_PORT` | Daemon port (default 9477) |
| `STORM_HQ_HOME` | Repo root (profiles, allowlists) |
| `STORM_HQ_DB` | SQLite path (default `~/.storm-hq/telemetry.db`) |
| `CLAUDE_CODE_USE_VERTEX` | Vertex routing for Claude adapters |
| `ANTHROPIC_VERTEX_PROJECT_ID` | GCP project |
| `ANTHROPIC_VERTEX_LOCATION` | Region (us-east5 or global) |
| `ANTHROPIC_DIRECT_KEY` | Direct Anthropic fallback |
| `CURSOR_API_KEY` | Kakashi / grok-4-5 route |
| `STORM_HQ_LIVE` | Enable live adapter smoke tests |

Secrets never committed; UI shows configured/missing only.
