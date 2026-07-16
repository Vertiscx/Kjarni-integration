// Handles Kjarni's OAuth2-style "password grant" login and caches the
// resulting Bearer token in KV so we don't log in again for every event.
//
// Flow, per Kjarni's docs:
//   POST https://{tenant}/Token
//   Content-Type: application/x-www-form-urlencoded
//   Accepts: application/json
//   body: username=...&password=...&grant_type=password
// Response includes access_token and expires_in (seconds).

const TOKEN_KV_KEY = "kjarni-bearer-token";
const SAFETY_MARGIN_SECONDS = 60; // refresh a little before it actually expires

export async function getToken(env) {
  const cached = await env.TOKEN_CACHE.get(TOKEN_KV_KEY, { type: "json" });
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  return refreshToken(env);
}

async function refreshToken(env) {
  const tokenUrl = `https://${env.KJARNI_TENANT_HOST}/Token`;

  const body = new URLSearchParams({
    username: env.KJARNI_USERNAME,
    password: env.KJARNI_PASSWORD,
    grant_type: "password",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accepts: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kjarni token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const expiresInSeconds = Number(data.expires_in) || 3600;
  const expiresAt = Date.now() + (expiresInSeconds - SAFETY_MARGIN_SECONDS) * 1000;

  await env.TOKEN_CACHE.put(
    TOKEN_KV_KEY,
    JSON.stringify({ accessToken: data.access_token, expiresAt }),
    { expirationTtl: expiresInSeconds }
  );

  return data.access_token;
}

// Fetches the actual changed record. The webhook notification itself never
// contains business data — only a relative `Endpoint`, e.g.
// "kjarni/api/v2/HrFunctions/2" — by design, so a leaked webhook payload
// alone can't be used to read HR data. We still need a valid bearer token
// to actually retrieve it.
export async function fetchKjarniRecord(env, token, endpoint) {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `https://${env.KJARNI_TENANT_HOST}${path}`;

  const response = await fetch(url, {
    headers: {
      Accepts: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kjarni record fetch failed (${response.status}): ${text}`);
  }

  return response.json();
}
