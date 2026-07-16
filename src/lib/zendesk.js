// Creates a ticket in Zendesk using token-based Basic Auth:
// https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/
//
// Basic auth value is base64("{email}/token:{api_token}").

export async function createZendeskTicket(env, ticket) {
  const url = `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets.json`;
  const credentials = `${env.ZENDESK_EMAIL}/token:${env.ZENDESK_API_TOKEN}`;
  const authHeader = `Basic ${btoa(credentials)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticket }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zendesk ticket creation failed (${response.status}): ${text}`);
  }

  return response.json();
}
