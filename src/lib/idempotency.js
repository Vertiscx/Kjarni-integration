// Guards against creating duplicate Zendesk tickets. Two things can cause
// the same notification to be processed more than once:
//   1. Kjarni itself retries a webhook delivery (see its `Attempt` field).
//   2. Our own queue redelivers a message after a transient failure
//      (e.g. Zendesk was briefly down) even though part of the work
//      already succeeded.
// Keyed on `${eventId}:${attempt}` so genuinely distinct attempts are still
// distinguishable in the audit trail, while retries of the exact same
// delivery are recognized as duplicates.

const RETENTION_SECONDS = 60 * 60 * 24 * 14; // keep 14 days for audit/debugging

export async function alreadyProcessed(env, key) {
  const value = await env.IDEMPOTENCY.get(key);
  return value !== null;
}

export async function markProcessed(env, key, zendeskTicketId) {
  await env.IDEMPOTENCY.put(
    key,
    JSON.stringify({
      zendeskTicketId,
      processedAt: new Date().toISOString(),
    }),
    { expirationTtl: RETENTION_SECONDS }
  );
}
