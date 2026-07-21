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
// `record` is the merged EmployeeMasters + HrData/EmployeesAll object built
// in src/index.js's processEvent() — see README for why it's two Kjarni API
// calls, not one. Each variable below is declared separately (rather than
// inlined) specifically so it's obvious which template placeholder it
// corresponds to.
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
  // action looks like "EmployeeMaster.Update" or "OrgCompany.Insert"
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

// Maps each bracketed template placeholder to its real value on `record`
// (the merged EmployeeMasters + HrData/EmployeesAll object built in
// src/index.js's processEvent()). Field names/mapping confirmed against a
// real Kjarni demo-tenant event — see README's "Two Kjarni record fetches"
// section for where each field comes from.
//
// entityType/changeType aren't used yet — only one template variant exists
// (hafnarfjordur's), so there's nothing to branch on. If EmployeeMaster vs
// some other entity type ever need different wording, that branching would
// go here.
function placeholderValues(record) {
  return {
    "[SSN]": record.SocialSecurityNumber,
    "[FULL NAME]": record.Name,
    "[TEXT]": record.DivisionName, // "Svið" — template's own placeholder is literally "[TEXT]"
    "[DEPARTMENT]": record.Department,
    "[POSITION]": record.JobTitle,
    "[TYPE OF EMPLOYMENT]": record.EmploymentTypeName,
    "[SUPERVISOR]": record.ManagerName,
    "[FIRST DAY]": formatDate(record.LastHireDate),
    "[END DAY]": formatDate(record.LastDayOfWork),
    "[EMPLOYMENT PORTION]": formatPercentage(record.EmploymentPercentage),
  };
}

// Kjarni dates arrive as full ISO timestamps (e.g. "2026-08-01T00:00:00Z")
// with a meaningless midnight time component — the ticket only needs the date.
function formatDate(value) {
  return value ? value.slice(0, 10) : "";
}

function formatPercentage(value) {
  return value === null || value === undefined ? "" : `${value}%`;
}

function applyPlaceholders(template, record) {
  const values = placeholderValues(record);
  return Object.entries(values).reduce(
    (text, [placeholder, value]) => text.replaceAll(placeholder, value ?? ""),
    template
  );
}

function buildSubject(entityType, changeType, record, subjectTemplate) {
  return applyPlaceholders(subjectTemplate, record);
}

function buildBody(entityType, changeType, record, bodyTemplate) {
  return applyPlaceholders(bodyTemplate, record);
}
