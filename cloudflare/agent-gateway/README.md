# tko-agent-gateway

`src/index.js` is a snapshot of the live Cloudflare Worker `tko-agent-gateway` as of 2026-11-02.
SHA-256 `a1828a0861b0634f14069bb98b6bdad10509c8aca3ec46380a234b877ca49af0` (7037 bytes).
It came from a Feb 18 dashboard upload and had not been committed. Keep the file byte-for-byte, including the literal `\u2013` escapes in the prompt text.

Secrets are set in Cloudflare, not in this repo:

```sh
wrangler secret put TKO_GATEWAY_TOKEN
wrangler secret put OPENAI_API_KEY
```

The Workers Builds connection for this worker is not yet configured. Do not reconnect it from FTG-TKO, and do not point a build at this directory until that is an explicit decision.

## Open issues (fix later in this repo)

- The gateway token value is still in TKO-Agents public git history. Rotate the secret. Removing it from `wrangler.toml` does not make the old value private.
- `/lead-event` runs before the auth check, so it is unauthenticated. Anyone with a leadId can append events.
- `index.js` is esbuild output, not hand-written source. `sha256Hex` is unused, and the sourcemap comment is duplicated.
- When a Workers Builds connection is configured, the root must be `cloudflare/agent-gateway`. The previous connection pointed at QuantPhizz/FTG-TKO, whose root `wrangler.jsonc` is `ftg-web`, so those builds failed.
