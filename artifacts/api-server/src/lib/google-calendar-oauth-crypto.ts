import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/calendar/google/callback";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type GoogleCalendarOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function parseGoogleCalendarEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be base64.");
  }
  const standardBase64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(standardBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.",
    );
  }
  return key;
}

export function encryptGoogleCalendarSecret(
  plaintext: string,
  key: Buffer,
): EncryptedSecret {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptGoogleCalendarSecret(
  encrypted: EncryptedSecret,
  key: Buffer,
): string {
  if (key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createGoogleCalendarPkcePair(): {
  verifier: string;
  challenge: string;
} {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function hashGoogleCalendarOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function safelyEqualOAuthState(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function createGoogleCalendarAuthorizationUrl(input: {
  config: GoogleCalendarOAuthClientConfig;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
