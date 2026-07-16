// Registry mapping a customer ID to their ticket templates. Deliberately
// uses static imports (not dynamic `import()`), since Wrangler/esbuild
// bundles a Worker as one fixed graph of modules — a dynamically computed
// import path isn't guaranteed to bundle correctly. This does mean a new
// customer needs one new import line + one new registry entry below (see
// the "Onboard a new customer" checklist in the setup guide).

import * as hafnarfjordur from "./hafnarfjordur.js";

const templatesByCustomer = {
  hafnarfjordur,
};

// Looked up via env.CUSTOMER_ID — set per customer in that customer's
// [env.customerX.vars] block in wrangler.toml.
export function getTemplatesForCustomer(customerId) {
  const templates = templatesByCustomer[customerId];
  if (!templates) {
    throw new Error(
      `No ticket templates registered for customer "${customerId}". ` +
        `Add src/templates/${customerId}.js and register it in src/templates/index.js.`
    );
  }
  return templates;
}
