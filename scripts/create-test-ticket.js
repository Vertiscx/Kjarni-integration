#!/usr/bin/env node
// Actually calls the real Zendesk API to create a ticket.
//
// Note on the Java code samples you pointed to
// (https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/#code-samples-6):
// Cloudflare Workers can't run Java — this project has been JavaScript
// throughout (same reason the local test-signing helper was rewritten from
// Python to JS earlier). That page's samples are all equivalent regardless
// of language though: same URL, same Basic-auth scheme, same JSON body
// shape (wrapped in a top-level "ticket" key) — I checked ours against
// Zendesk's official reference directly, so src/lib/zendesk.js already
// matches what the Java sample does, just in JS.
//
// This script doesn't duplicate that logic — it imports and runs the exact
// same mapToZendeskTicket() / createZendeskTicket() functions the deployed
// Worker uses (src/lib/mapping.js, src/lib/zendesk.js), just from plain
// Node instead of from inside a Worker. The `env` object below stands in
// for what would otherwise be Worker vars/secrets.
//
// Replace the placeholders below with your real Zendesk subdomain, email,
// and API token before running. This WILL create a real ticket in that
// Zendesk instance — point it at a sandbox/test instance if you have one,
// not production, until the field mapping (brand/group/requester/assignee/
// form — still TODOs in mapping.js) is finalized.
//
// Get an API token: Zendesk Admin Center -> Apps and integrations -> APIs
// -> Zendesk API -> add API token.
//
// Run: node scripts/create-test-ticket.js

import { mapToZendeskTicket } from "../src/lib/mapping.js";
import { createZendeskTicket } from "../src/lib/zendesk.js";

// TODO: replace the auth placeholders below with real values before running.
// The routing IDs (brand/group/requester/assignee/form/tags) are NOT
// placeholders — they mirror wrangler.toml's [env.hafnarfjordur.vars], since
// this script is testing hafnarfjordur specifically. Keep these two in sync.
const env = {
  ZENDESK_SUBDOMAIN: "YOUR_SUBDOMAIN_HERE", // e.g. "vertis" for vertis.zendesk.com
  ZENDESK_EMAIL: "YOUR_EMAIL_HERE", // the Zendesk agent account email
  ZENDESK_API_TOKEN: "YOUR_API_TOKEN_HERE",
  CUSTOMER_ID: "hafnarfjordur",
  ZENDESK_BRAND_ID: 7330193677468,
  ZENDESK_GROUP_ID: 7887413996700,
  ZENDESK_REQUESTER_ID: 366526889760,
  ZENDESK_ASSIGNEE_ID: 7887413996700,
  ZENDESK_FORM_ID: 11075142364060,
  ZENDESK_TICKET_TAGS: ["nyr_starfsmadur_launateymi"],
};

// Stand-in for "the data we've received from Kjarni" — same sample record
// used in scripts/build-sample-payload.js.
const SAMPLE_ACTION = "HrFunction.Update";
const SAMPLE_RECORD = {
  ID: "42",
  Name: "Jón Jónsson",
  Department: "Sales",
  WorkEmail: "jon@jon.is",
};

async function main() {
  if (env.ZENDESK_EMAIL === "YOUR_EMAIL_HERE" || env.ZENDESK_API_TOKEN === "YOUR_API_TOKEN_HERE") {
    console.error(
      "Replace the ZENDESK_SUBDOMAIN / ZENDESK_EMAIL / ZENDESK_API_TOKEN placeholders " +
        "at the top of this script with real values before running it."
    );
    process.exit(1);
  }

  const ticket = mapToZendeskTicket(SAMPLE_ACTION, SAMPLE_RECORD, env);
  console.log("Sending ticket payload:\n", JSON.stringify({ ticket }, null, 2));

  const response = await createZendeskTicket(env, ticket);
  console.log("\nZendesk response:\n", JSON.stringify(response, null, 2));
  console.log(`\nCreated ticket #${response.ticket.id}`);
}

main().catch((err) => {
  console.error("\nFailed to create ticket:", err.message);
  process.exit(1);
});
