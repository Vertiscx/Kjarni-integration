// Verifies the `ms-signature` header Kjarni sends on every webhook POST.
//
// Kjarni computes it like this (from their docs, C#):
//   HMACSHA256(secret, rawBody) -> hex, uppercase, prefixed "sha256="
// e.g. "sha256=D8E271776E5F3E2C3710B903388E9FB7B1DA905B69AE22A26A17D931B33897E9"
//
// We must recompute the same thing over the *raw* request body (before any
// JSON.parse) using the shared secret we set when we registered the webhook,
// and compare it to the header. If it doesn't match, the request did not
// genuinely come from Kjarni (or the body was altered in transit) and must
// be rejected before we act on it.

export async function verifySignature(rawBody, secret, header) {
  if (!secret || !header) return false;

  const expected = await computeSignature(rawBody, secret);
  return timingSafeEqual(expected, header);
}

async function computeSignature(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = [...new Uint8Array(signatureBytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `sha256=${hex}`;
}

// Plain `===` on secrets/signatures is technically vulnerable to timing
// attacks (an attacker can measure how long the comparison takes to guess
// the value byte-by-byte). This walks the whole string every time instead
// of stopping early on a mismatch.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
