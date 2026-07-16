# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Cloudflare Workers middleware service that turns Kjarni (an Icelandic HR/payroll system) webhook events into Zendesk tickets. Kjarni notifies us that something changed; the Worker fetches the actual record from Kjarni, maps it to a Zendesk ticket payload, and creates the ticket via the Zendesk API.

The service is multi-tenant: one customer = one `[env.X]` block in `wrangler.toml` = one fully separate Worker deployment. There is no runtime multi-tenant logic or access control in the code — isolation is structural, enforced by Wrangler environments each having their own secrets, KV namespaces, and queues. A Worker for customer A has no binding that could reach customer B's data even if the code tried.

Currently one customer is defined: `hafnarfjordur` (Hafnarfjörður, an Icelandic municipality — referenced in the ticket body text as "Hafnarfjarðarbæjar").

## Commands

Install dependencies:
```
npm install
```

Run the Worker locally (serves `http://localhost:8787`, uses the `hafnarfjordur` env and `.dev.vars` for secrets):
```
npm run dev
```

Test the webhook end-to-end against a running `npm run dev` server — signs a sample Kjarni payload with HMAC-SHA256, fires the echo-reachability check, then the signed event POST:
```
npm run test:webhook -- <secret-matching-KJARNI_WEBHOOK_SECRET-in-.dev.vars> [webhook-url]
```

Print the exact ticket JSON `mapToZendeskTicket()` currently produces, without touching Zendesk (useful for diffing against `temp/payload_template.json`):
```
npm run sample:payload
```

Actually create a real ticket in Zendesk using the mapping/zendesk-client code (edit the placeholders — subdomain, email, API token — at the top of the script first; it refuses to run with placeholder auth values still in place):
```
npm run create:test-ticket
```

Deploy the `hafnarfjordur` Worker:
```
npm run deploy:hafnarfjordur
```

Tail live logs for the deployed `hafnarfjordur` Worker:
```
npx wrangler tail --env hafnarfjordur
```

There is no automated test suite, linter, or type checker configured. Verification is done via the three scripts above (`sample:payload` for pure mapping logic, `test:webhook` for the HTTP/signature layer against a local dev server, `create:test-ticket` for the real Zendesk call).

### Onboarding a new customer

1. Duplicate the `[env.hafnarfjordur]` block in `wrangler.toml` (a commented-out `customerB` skeleton already exists for this — rename it), giving it a unique env name, Worker `name`, `KJARNI_TENANT_HOST`, `ZENDESK_SUBDOMAIN`, `CUSTOMER_ID`, and Zendesk routing IDs (brand/group/requester/assignee/form/tags).
2. Create that customer's KV namespaces and queues, then paste the printed IDs into the new block:
   ```
   npx wrangler kv namespace create TOKEN_CACHE --env <customerX>
   npx wrangler kv namespace create IDEMPOTENCY --env <customerX>
   npx wrangler queues create <customerX>-kjarni-events
   npx wrangler queues create <customerX>-kjarni-events-dlq
   ```
3. Set that customer's secrets:
   ```
   npx wrangler secret put KJARNI_USERNAME --env <customerX>
   npx wrangler secret put KJARNI_PASSWORD --env <customerX>
   npx wrangler secret put KJARNI_WEBHOOK_SECRET --env <customerX>
   npx wrangler secret put ZENDESK_EMAIL --env <customerX>
   npx wrangler secret put ZENDESK_API_TOKEN --env <customerX>
   ```
4. Add `src/templates/<customerX>.js` (export `subjectTemplate` and `bodyTemplate`) and register it in `src/templates/index.js` — the `CUSTOMER_ID` var from step 1 must match this registry key exactly, or ticket creation throws at runtime.
5. `npx wrangler deploy --env <customerX>`.

## Architecture

### Request flow (`src/index.js`)

A single Worker script exports both a `fetch()` and a `queue()` handler — this is the entire request lifecycle for one customer:

- **`fetch()`** is the public endpoint Kjarni's webhook calls. It does only three things, deliberately kept fast: answers Kjarni's reachability check (`GET ?echo=<value>` → echo it back verbatim), verifies the `ms-signature` HMAC-SHA256 header against the raw request body (before JSON parsing — see `src/lib/verifySignature.js`), then enqueues one message per notification in the payload's `Notifications` array and returns `200 Accepted` immediately. It never does the slow work itself, so Kjarni's own retry/timeout logic never fires while we're mid-processing.
- **`queue()`** is where the actual work happens, via `processEvent()`: check idempotency, get/refresh a Kjarni bearer token, fetch the full record from Kjarni, map it to a Zendesk ticket, POST it to Zendesk, then mark the event processed. On failure it calls `message.retry()`, which Cloudflare Queues redelivers according to `max_retries`/`dead_letter_queue` in `wrangler.toml` — failures don't silently vanish, they land on the DLQ once retries are exhausted.

The webhook notification payload itself carries no business data (only an `Action` and a relative `Endpoint`) — by Kjarni's own design, so a leaked/intercepted webhook call alone can't expose HR data. The actual record always requires a second authenticated GET.

### Per-customer configuration (`wrangler.toml`)

Everything that varies by customer lives in that customer's `[env.<name>.vars]` block, not in code: `KJARNI_TENANT_HOST`, `ZENDESK_SUBDOMAIN`, `CUSTOMER_ID` (used for template lookup, see below), and the Zendesk routing IDs `ZENDESK_BRAND_ID`/`ZENDESK_GROUP_ID`/`ZENDESK_REQUESTER_ID`/`ZENDESK_ASSIGNEE_ID`/`ZENDESK_FORM_ID`/`ZENDESK_TICKET_TAGS`. Wrangler vars support native TOML types directly — `ZENDESK_TICKET_TAGS` is a real JS array at runtime, the IDs are real JS numbers (all currently 13–14 digits and verified to stay within `Number.isSafeInteger` range). Secrets (`KJARNI_USERNAME`, `KJARNI_PASSWORD`, `KJARNI_WEBHOOK_SECRET`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`) are never put in `vars` — always `wrangler secret put ... --env <name>`, or `.dev.vars` locally.

`hafnarfjordur`'s `KJARNI_TENANT_HOST` and `ZENDESK_SUBDOMAIN` values are still placeholders following the naming convention (`hafnarfjordur-api.starfsmenn.is` / `hafnarfjordur`) — not yet confirmed against the real Kjarni tenant hostname or Zendesk subdomain.

### Ticket mapping (`src/lib/mapping.js`)

`mapToZendeskTicket(action, record, env)` builds the plain-object ticket payload (unwrapped — no top-level `"ticket"` key; `src/lib/zendesk.js` adds that wrapper when it POSTs). The routing IDs come straight from `env`. The subject/body *text* comes from a per-customer template (see below), looked up via `env.CUSTOMER_ID`.

`buildSubject`/`buildBody` currently just return the template text as-is — the bracketed placeholders in the templates (`[SSN]`, `[FULL NAME]`, `[DEPARTMENT]`, etc.) are intentionally still literal text, not yet wired to real fields on `record`. `entityType`/`changeType` (parsed from `action`, e.g. `"HrFunction.Update"` → `HrFunction`/`Update`) are accepted but unused so far — the parsing exists for when different entity/change types need different template variants. This substitution (bracketed placeholder → real `record` field) is the main piece of business logic not yet implemented.

### Per-customer templates (`src/templates/`)

`src/templates/index.js` is a static-import registry mapping `CUSTOMER_ID` → `{ subjectTemplate, bodyTemplate }`. It uses static imports rather than a dynamic `import(computedPath)` deliberately — Wrangler/esbuild bundles a Worker as one fixed module graph, so a dynamically computed import path isn't reliably bundleable. Adding a customer means one new import line plus one new registry key, matching that customer's `CUSTOMER_ID` value exactly (a mismatch throws a clear error at runtime rather than failing silently).

`src/templates/customerA.js` is stale leftover from before this customer was identified as `hafnarfjordur` — it's unused (not imported by `index.js`) and can be deleted; it was kept only because files in the delivery environment couldn't be removed at the time.

