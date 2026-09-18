import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGoogleCalendarAuthorizationUrl,
  createGoogleCalendarPkcePair,
  decryptGoogleCalendarSecret,
  encryptGoogleCalendarSecret,
  GOOGLE_CALENDAR_SCOPE,
  hashGoogleCalendarOAuthState,
  parseGoogleCalendarEncryptionKey,
  safelyEqualOAuthState,
} from "../src/lib/google-calendar-oauth-crypto.ts";

const encryptionKey = Buffer.alloc(32, 7);

test("Google Calendar secrets are encrypted and authenticated", () => {
  const token = "refresh-token-that-must-not-be-stored-in-plain-text";
  const encrypted = encryptGoogleCalendarSecret(token, encryptionKey);

  assert.notEqual(encrypted.ciphertext, token);
  assert.equal(decryptGoogleCalendarSecret(encrypted, encryptionKey), token);
  assert.notEqual(
    encryptGoogleCalendarSecret(token, encryptionKey).iv,
    encrypted.iv,
  );
});

test("Google Calendar ciphertext rejects tampering and wrong keys", () => {
  const encrypted = encryptGoogleCalendarSecret(
    "sensitive-value",
    encryptionKey,
  );
  const firstChar = encrypted.ciphertext[0] === "A" ? "B" : "A";
  const tampered = {
    ...encrypted,
    ciphertext: `${firstChar}${encrypted.ciphertext.slice(1)}`,
  };

  assert.throws(() => decryptGoogleCalendarSecret(tampered, encryptionKey));
  assert.throws(() =>
    decryptGoogleCalendarSecret(encrypted, Buffer.alloc(32, 8)),
  );
  assert.throws(() => encryptGoogleCalendarSecret("value", Buffer.alloc(16)));
});

test("the Vercel encryption key parser requires exactly 32 decoded bytes", () => {
  const value = encryptionKey.toString("base64");
  assert.deepEqual(parseGoogleCalendarEncryptionKey(value), encryptionKey);
  assert.throws(() =>
    parseGoogleCalendarEncryptionKey(Buffer.alloc(16).toString("base64")),
  );
  assert.throws(() => parseGoogleCalendarEncryptionKey("not a key"));
});

test("OAuth state comparison is constant-shape and detects mismatches", () => {
  assert.equal(hashGoogleCalendarOAuthState("random-state").length, 64);
  assert.equal(safelyEqualOAuthState("random-state", "random-state"), true);
  assert.equal(safelyEqualOAuthState("random-state", "different-state"), false);
});

test("authorization requests use PKCE and only the approved calendar scope", () => {
  const pkce = createGoogleCalendarPkcePair();
  const authorizationUrl = new URL(
    createGoogleCalendarAuthorizationUrl({
      config: {
        clientId: "test-client-id",
        clientSecret: "server-secret-must-not-be-in-the-url",
        redirectUri:
          "https://gestaocampanha15088.vercel.app/api/calendar/google/callback",
      },
      state: "one-time-state",
      codeChallenge: pkce.challenge,
    }),
  );

  assert.equal(authorizationUrl.origin, "https://accounts.google.com");
  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    GOOGLE_CALENDAR_SCOPE,
  );
  assert.equal(authorizationUrl.searchParams.get("access_type"), "offline");
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge_method"),
    "S256",
  );
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge"),
    pkce.challenge,
  );
  assert.equal(authorizationUrl.searchParams.has("client_secret"), false);
  assert.equal(pkce.verifier.length, 43);
});
