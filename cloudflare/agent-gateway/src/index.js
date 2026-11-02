// src/index.js
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, service: "tko-agent-gateway" }),
        { headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname === "/lead-event") {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const body = await request.json().catch(() => ({}));
  const { leadId, event } = body || {};

  if (!leadId || !event) {
    return new Response(JSON.stringify({ ok: false, error: "missing_fields" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const existing = await env.LEADS_KV.get(leadId);
  if (!existing) {
    return new Response(JSON.stringify({ ok: false, error: "lead_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const lead = JSON.parse(existing);
  const now = Date.now();

  lead.updatedAt = now;
  lead.events = Array.isArray(lead.events) ? lead.events : [];
  lead.events.push({ event, at: now });

  // Minimal state transitions
  if (event === "audit_viewed") lead.status = "audit_viewed";
  if (event === "cta_clicked") lead.status = "cta_clicked";
  if (event === "checkout_started") lead.status = "checkout_started";

  await env.LEADS_KV.put(leadId, JSON.stringify(lead));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
}

    const auth = request.headers.get("Authorization") || "";
const expected = `Bearer ${env.TKO_GATEWAY_TOKEN}`;

if (auth !== expected) {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "method_not_allowed" }),
        { status: 405, headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname === "/run") {
      const body = await request.json().catch(() => ({}));
      const { agentId, input } = body;
      if (agentId !== "audit.v1") {
        return new Response(
          JSON.stringify({ ok: false, error: "agent_not_allowed" }),
          { status: 403, headers: { "content-type": "application/json" } }
        );
      }
      const {
        businessType,
        hasWebsite,
        monthlyLeads,
        bookingMethod,
        biggestPain
      } = input || {};
      const prompt = `
You are an AI business auditor.
Return ONLY valid JSON. No markdown. No commentary.

INPUT:
- businessType: ${businessType}
- hasWebsite: ${hasWebsite}
- monthlyLeads: ${monthlyLeads}
- bookingMethod: ${bookingMethod}
- biggestPain: ${biggestPain}

TASK:
1. Identify 3\u20135 concrete problems.
2. Identify 3\u20135 fast quick wins.
3. Recommend exactly ONE tier: Ignite, Accelerate, or Dominate.
4. Provide ONE nextAction string.

OUTPUT SHAPE:
{
  "problems": [],
  "quickWins": [],
  "recommendedTier": "",
  "nextAction": ""
}
`;
      let aiResult;
      try {
        aiResult = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          prompt,
          max_tokens: 256
        });
      } catch (e) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "workers_ai_call_failed",
            details: String(e && (e.stack || e.message || e))
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      const content = aiResult?.response || aiResult?.output_text || aiResult?.result;
      if (!content) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "workers_ai_empty_response",
            raw: aiResult
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
      async function runModel(promptText, maxTokens) {
  const r = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    prompt: promptText,
    max_tokens: maxTokens
  });
  return String(r?.response || r?.output_text || r?.result || "").trim();
}

function tryParseJsonLoose(s) {
  // Try raw parse
  try { return JSON.parse(s); } catch {}

  // Try common cleanup: trailing commas
  const cleaned = s.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(cleaned); } catch {}

  // Try append a closing brace if it looks like it was truncated mid-object
  if (!cleaned.trim().endsWith("}")) {
    try { return JSON.parse(cleaned + "}"); } catch {}
  }

  return null;
}

let raw = String(content).trim();
let parsed = tryParseJsonLoose(raw);

if (!parsed) {
  // One retry: stricter, shorter, string-only arrays, no IDs
  const retryPrompt = `
You are an AI business auditor.
Return ONLY valid JSON. No markdown. No commentary.

OUTPUT MUST BE STRICT JSON (no trailing commas), and MUST MATCH THIS EXACT SHAPE:
{
  "problems": ["string","string","string"],
  "quickWins": ["string","string","string"],
  "recommendedTier": "Ignite" | "Accelerate" | "Dominate",
  "nextAction": "string"
}

Rules:
- problems and quickWins MUST be arrays of strings ONLY.
- Do NOT include objects. Do NOT include ids. Do NOT include extra keys.
- Keep nextAction under 160 characters.

INPUT:
- businessType: ${businessType}
- hasWebsite: ${hasWebsite}
- monthlyLeads: ${monthlyLeads}
- bookingMethod: ${bookingMethod}
- biggestPain: ${biggestPain}
`;

  raw = await runModel(retryPrompt, 300);
  parsed = tryParseJsonLoose(raw);

  if (!parsed) {
    return new Response(
  JSON.stringify({ ok: false, error: "bad_model_output" }),
  { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}

const leadId = crypto.randomUUID();

const leadRecord = {
  leadId,
  agentId,
  vertical: "smb",
  tier: parsed?.recommendedTier || null,

  status: "audit_generated",
  paymentStatus: "unpaid",
  subscriptionStatus: "none",

  createdAt: Date.now(),
  updatedAt: Date.now(),

  input: {
    businessType,
    hasWebsite,
    monthlyLeads,
    bookingMethod,
    biggestPain
  },

  result: parsed
};

await env.LEADS_KV.put(leadId, JSON.stringify(leadRecord));

return new Response(
  JSON.stringify({ ok: true, leadId, data: parsed }),
  { status: 200, headers: { "content-type": "application/json" } }
);
    }

    return new Response(
      JSON.stringify({ ok: false, error: "not_found" }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

//# sourceMappingURL=index.js.map

