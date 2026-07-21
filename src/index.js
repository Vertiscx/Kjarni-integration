// This one file is BOTH halves of the pipeline for a single customer:
//   - `fetch()`  = the public HTTP endpoint Kjarni's webhook calls
//   - `queue()`  = the background consumer that does the slow work
// Cloudflare lets a single Worker script export both handlers. The `fetch`
// handler's only jobs are: answer Kjarni's reachability check, verify the
// signature, and enqueue — so it can respond in milliseconds and never
// risk Kjarni's own retry logic kicking in while we're still doing slow
// network calls to Kjarni/Zendesk. All of that slow work happens in
// `queue()`, with automatic retries handled by Cloudflare Queues.
//
// Remember: this exact same code is deployed once PER CUSTOMER (once per
// `[env.customerX]` block in wrangler.toml). Each deployment gets its own
// secrets/KV/queue — this file never needs to know which customer it's
// running for beyond reading its own `env`.

import { verifySignature } from "./lib/verifySignature.js";
import { getToken, fetchKjarniRecord, fetchEmployeeDetailsBySsn } from "./lib/kjarniAuth.js";
import { mapToZendeskTicket } from "./lib/mapping.js";
import { createZendeskTicket } from "./lib/zendesk.js";
import { alreadyProcessed, markProcessed } from "./lib/idempotency.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      // Kjarni's subscriber-reachability check: it calls
      // GET <WebHookUri>?echo=<random value>, and expects that exact value
      // echoed back as the plain response body. This happens once when you
      // register the webhook, and Kjarni may re-check periodically.
      const echo = url.searchParams.get("echo");
      if (echo !== null) {
        return new Response(echo, { status: 200 });
      }
      return new Response("OK", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Read as text first — the signature must be verified over the exact
    // raw bytes Kjarni sent, before any JSON parsing.
    const rawBody = await request.text();

    const signatureHeader = request.headers.get("ms-signature") || "";
    const isValid = await verifySignature(rawBody, env.KJARNI_WEBHOOK_SECRET, signatureHeader);
    if (!isValid) {
      console.warn("Rejected webhook: invalid or missing ms-signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      return new Response("Malformed JSON body", { status: 400 });
    }

    const notifications = Array.isArray(payload.Notifications) ? payload.Notifications : [];

    console.log("Kjarni webhook payload:", JSON.stringify(payload));

    // Enqueue each notification as its own message and acknowledge Kjarni
    // immediately. The actual Kjarni record fetch + Zendesk ticket creation
    // happens later, in the queue() handler below.
    for (const notification of notifications) {
      await env.EVENT_QUEUE.send({
        eventId: payload.Id,
        attempt: payload.Attempt,
        action: notification.Action,
        recordId: notification.Id,
        endpoint: notification.Endpoint,
      });
    }

    return new Response("Accepted", { status: 200 });
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await processEvent(message.body, env);
        message.ack();
      } catch (err) {
        // Throwing (or, as here, calling retry()) tells Cloudflare Queues to
        // redeliver this message according to the max_retries / dead_letter_queue
        // settings in wrangler.toml. After it exhausts retries it lands on
        // the DLQ instead of silently vanishing.
        console.error("Failed to process Kjarni event", message.body, err);
        message.retry();
      }
    }
  },
};

async function processEvent(event, env) {
  const dedupeKey = `${event.eventId}:${event.attempt}`;

  if (await alreadyProcessed(env, dedupeKey)) {
    console.log(`Skipping already-processed event ${dedupeKey}`);
    return;
  }

  const token = await getToken(env);

  // EmployeeMasters (fetched via the webhook's own Endpoint) only carries
  // biographical fields. Department/JobTitle/Division/EmploymentType/Manager/
  // EmploymentPercentage live on the older HrData/Employees endpoint instead,
  // joined by kennitala (EntityNR / SocialSecurityNumber) since that's unique
  // per person, unlike name. This assumes event.action is always an
  // EmployeeMaster.* event — true today since that's the only filter we
  // subscribe to; revisit if other entity types are ever added.
  const masterRecord = await fetchKjarniRecord(env, token, event.endpoint);
  console.log(`Kjarni EmployeeMasters record for ${event.action} (${dedupeKey}):`, JSON.stringify(masterRecord));

  const employeeDetails = await fetchEmployeeDetailsBySsn(env, token, masterRecord.EntityNR);
  console.log(`Kjarni HrData/EmployeesAll record for ${event.action} (${dedupeKey}):`, JSON.stringify(employeeDetails));

  const record = { ...masterRecord, ...employeeDetails };
  const ticket = mapToZendeskTicket(event.action, record, env);
  const zendeskResponse = await createZendeskTicket(env, ticket);

  await markProcessed(env, dedupeKey, zendeskResponse.ticket.id);
}
