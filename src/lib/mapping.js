// Turns a Kjarni event + the fetched record into the fields for a Zendesk
// ticket, matching the shape defined in temp/payload_template.json:
//
//   { "ticket": {
//       "comment": { "body": "..." },
//       "subject": "...",
//       "brand_id": "...",
//       "group_id": "...",
//       "requester": "...",
//       "assignee": "...",
//       "form": "...",
//       "tags": "..."
//   } }
//
// This step only builds that payload (as a plain object here, and as an
// actual JSON string via scripts/build-sample-payload.js — see that file to
// print one). Actually sending it to the Zendesk API is a separate, later
// step (see src/lib/zendesk.js, which wraps whatever this function returns
// in { ticket: ... } and POSTs it — so the shape returned here deliberately
// stays *unwrapped*, no top-level "ticket" key, to match what zendesk.js
// already expects).
//
// The exact Kjarni record field names aren't finalized yet — we're building
// against the assumption that "we have the data we need" for now. Each
// variable below is declared separately (rather than inlined) specifically
// so it's obvious which template placeholder it corresponds to.
//
// The routing/identity fields (brand, group, requester, assignee, form,
// tags) come from `env` rather than being hardcoded here, because this same
// code runs once per customer (see wrangler.toml's [env.customerX.vars] —
// each customer has their own Zendesk brand/group/form/etc IDs). This
// function must be called with the env of whichever customer's Worker is
// running, e.g. `mapToZendeskTicket(action, record, env)`.
//
// The subject/body *text* is also per-customer — hafnarfjordur and customerB
// can want completely different wording — so it's not hardcoded here either.
// It's looked up from src/templates/ via env.CUSTOMER_ID (see
// src/templates/index.js).

import { getTemplatesForCustomer } from "../templates/index.js";

export function mapToZendeskTicket(action, record, env) {
  // action looks like "HrFunction.Update" or "OrgCompany.Insert"
  const [entityType, changeType] = action.split(".");

  const { subjectTemplate, bodyTemplate } = getTemplatesForCustomer(env.CUSTOMER_ID);

  // --- One variable per template placeholder ------------------------------

  const subject = buildSubject(entityType, changeType, record, subjectTemplate);
  const body = buildBody(entityType, changeType, record, bodyTemplate);

  const brandId = env.ZENDESK_BRAND_ID;
  const groupId = env.ZENDESK_GROUP_ID;
  const requester = env.ZENDESK_REQUESTER_ID;
  const assignee = env.ZENDESK_ASSIGNEE_ID;
  const form = env.ZENDESK_FORM_ID;

  // Zendesk's `tags` field is an array of strings even for a single tag.
  const tags = env.ZENDESK_TICKET_TAGS;

  // --- Assemble, matching temp/payload_template.json's inner shape --------

  return {
    comment: { body },
    subject,
    brand_id: brandId,
    group_id: groupId,
    requester,
    assignee,
    form,
    tags,
  };
}

// entityType/changeType/record aren't used yet — bracketed placeholders in
// the template ([SSN], [FULL NAME], etc.) are intentionally left as literal
// text for now, per instructions: we're not wiring these to real Kjarni
// record fields yet. Once the real Kjarni field names are decided, this is
// where each bracketed placeholder gets replaced with the corresponding
// value pulled from `record` (entityType/changeType may also end up driving
// which template variant is used, if HrFunction vs OrgCompany ever need
// different wording — that logic would also live here, still per-customer
// via subjectTemplate/bodyTemplate).
function buildSubject(entityType, changeType, record, subjectTemplate) {
  return subjectTemplate;
}

function buildBody(entityType, changeType, record, bodyTemplate) {
  return bodyTemplate;
}
