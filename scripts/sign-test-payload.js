#!/usr/bin/env node
// Local testing helper — Kjarni's payload signature is just HMAC-SHA256
// (the same algorithm src/lib/verifySignature.js recomputes on the Worker
// side), computed here with Node's built-in `crypto` module so there's no
// dependency beyond the Node.js you already installed for Wrangler.
//
// Usage:
//   node scripts/sign-test-payload.js <secret> [webhook-url]
//
// <secret> must match whatever you put in KJARNI_WEBHOOK_SECRET in your
// .dev.vars file for local testing.
//
// [webhook-url] defaults to http://localhost:8787/webhook (wrangler dev's
// default local address + the /webhook path used in this project).
//
// By default this script actually fires both requests (the echo-validation
// GET and the signed event POST) against your locally running
// `wrangler dev` server and prints the responses. It also prints the
// equivalent `curl` commands, in case you want to replay them by hand or
// paste them somewhere else (e.g. testing against a deployed Worker).

import crypto from "node:crypto";

const DEFAULT_WEBHOOK_URL = "http://localhost:8787/webhook";

const SAMPLE_PAYLOAD = {
  Id: "test-event-0001",
  Attempt: 1,
  Properties: {},
  Notifications: [
    {
      Action: "EmployeeMaster.Update",
      Id: "2",
      // Guessed to follow the same "kjarni/api/v2/<Entity>s/{id}" pattern as
      // Kjarni's HrFunctions example — not yet confirmed against a real
      // EmployeeMaster event. Update once a live event is observed.
      Endpoint: "kjarni/api/v2/EmployeeMasters/2",
    },
  ],
};

function computeSignature(secret, rawBody) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest.toUpperCase()}`;
}

function printUsageAndExit() {
  console.log(
    [
      "Usage: node scripts/sign-test-payload.js <secret> [webhook-url]",
      "",
      "  <secret>      Must match KJARNI_WEBHOOK_SECRET in your .dev.vars file.",
      `  [webhook-url] Defaults to ${DEFAULT_WEBHOOK_URL}`,
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  const [, , secret, webhookUrlArg] = process.argv;
  if (!secret) printUsageAndExit();

  const webhookUrl = webhookUrlArg || DEFAULT_WEBHOOK_URL;
  // Compact, stable JSON so the exact bytes we sign are the exact bytes we send.
  const rawBody = JSON.stringify(SAMPLE_PAYLOAD);
  const signature = computeSignature(secret, rawBody);

  const echoUrl = `${webhookUrl}?echo=hello123`;

  console.log("# Equivalent curl commands, for reference:\n");
  console.log(`curl "${echoUrl}"\n`);
  console.log(
    `curl -X POST '${webhookUrl}' ` +
      `-H 'ms-signature: ${signature}' ` +
      `-H 'Content-Type: application/json' ` +
      `-d '${rawBody}'\n`
  );

  console.log("# Running both requests now...\n");

  await runEchoCheck(echoUrl);
  await runSignedEvent(webhookUrl, signature, rawBody);
}

async function runEchoCheck(echoUrl) {
  try {
    const response = await fetch(echoUrl);
    const text = await response.text();
    const ok = text === "hello123";
    console.log(
      `[echo check] ${response.status} — body: "${text}" ${ok ? "(matches expected value)" : "(does NOT match — check your fetch() handler)"}`
    );
  } catch (err) {
    console.log(`[echo check] request failed: ${err.message} — is 'npm run dev' running?`);
  }
}

async function runSignedEvent(webhookUrl, signature, rawBody) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "ms-signature": signature,
        "Content-Type": "application/json",
      },
      body: rawBody,
    });
    const text = await response.text();
    console.log(`[signed event] ${response.status} — body: "${text}"`);
    if (response.status === 200) {
      console.log(
        "Check the 'npm run dev' terminal for queue() logs — the event is processed asynchronously."
      );
    }
  } catch (err) {
    console.log(`[signed event] request failed: ${err.message} — is 'npm run dev' running?`);
  }
}

main();
