#!/usr/bin/env node
// Prints the exact JSON string src/lib/mapping.js currently produces, so you
// can check it against temp/payload_template.json without touching the real
// Zendesk API (that wiring is a later step — see src/lib/zendesk.js).
//
// This assumes "we have gotten the data we need" from Kjarni already, using
// a stand-in sample record below. Swap SAMPLE_ACTION / SAMPLE_RECORD for
// whatever the real Kjarni payload shape turns out to be once that's
// decided — nothing else needs to change.
//
// Run: node scripts/build-sample-payload.js

import { mapToZendeskTicket } from "../src/lib/mapping.js";

const SAMPLE_ACTION = "HrFunction.Update";

const SAMPLE_RECORD = {
  ID: "42",
  Name: "Jón Jónsson",
  Department: "Sales",
  WorkEmail: "jon@jon.is",
};

// Mirrors wrangler.toml's [env.hafnarfjordur.vars] — keep these two in sync.
const SAMPLE_ENV = {
  CUSTOMER_ID: "hafnarfjordur",
  ZENDESK_BRAND_ID: 7330193677468,
  ZENDESK_GROUP_ID: 7887413996700,
  ZENDESK_REQUESTER_ID: 366526889760,
  ZENDESK_ASSIGNEE_ID: 7887413996700,
  ZENDESK_FORM_ID: 11075142364060,
  ZENDESK_TICKET_TAGS: ["nyr_starfsmadur_launateymi"],
};

const ticket = mapToZendeskTicket(SAMPLE_ACTION, SAMPLE_RECORD, SAMPLE_ENV);

// Matches temp/payload_template.json's outer shape: { "ticket": {...} }
const payload = { ticket };

console.log(JSON.stringify(payload, null, 2));
