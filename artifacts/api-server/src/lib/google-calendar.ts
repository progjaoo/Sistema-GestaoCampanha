import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import {
  authPermissionsTable,
  authRolePermissionsTable,
  authUsersTable,
  db,
  googleCalendarIntegrationTable,
  googleCalendarOAuthStatesTable,
} from "@workspace/db";
import {
  createGoogleCalendarAuthorizationUrl,
  createGoogleCalendarPkcePair,
  decryptGoogleCalendarSecret,
  encryptGoogleCalendarSecret,
  hashGoogleCalendarOAuthState,
  parseGoogleCalendarEncryptionKey,
  type EncryptedSecret,
  type GoogleCalendarOAuthClientConfig,
} from "./google-calendar-oauth-crypto";

const GOOGLE_API_BASE_URL = "https://www.googleapis.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_INTEGRATION_ID = "google_calendar";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_SECONDS = 60;
const MAX_GOOGLE_REQUEST_MS = 15_000;

type CalendarRequestInit = {
  method?: string;
  body?: string | null;
  headers?: Record<string, string> | Headers;
  signal?: AbortSignal | null;
};

export type GoogleCalendarRequest = (
  path: string,
  init?: CalendarRequestInit,
) => Promise<Response>;

type OAuthTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
};

type CachedAccessToken = {
  accessToken: string;
  expiresAt: number;
  integrationUpdatedAt: number;
};

export class GoogleCalendarOAuthError extends Error {
  constructor(
    readonly code:
      | "configuration_missing"
      | "not_connected"
      | "reauthorization_required"
      | "token_request_failed"
      | "authorization_failed",
  ) {
    super(code);
    this.name = "GoogleCalendarOAuthError";
  }
}

let requestOverride: GoogleCalendarRequest | null = null;
let fetchOverride: typeof fetch | null = null;
let cachedAccessToken: CachedAccessToken | null = null;
let refreshInFlight: Promise<CachedAccessToken> | null = null;

function getClientConfig(): GoogleCalendarOAuthClientConfig {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  const rawEncryptionKey =
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !rawEncryptionKey) {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }

  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }
  if (
    (callback.protocol !== "https:" && callback.protocol !== "http:") ||
    callback.username ||
    callback.password ||
    callback.pathname !== "/api/calendar/google/callback" ||
    callback.search ||
    callback.hash ||
    (process.env.NODE_ENV === "production" && callback.protocol !== "https:")
  ) {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }

  parseGoogleCalendarEncryptionKey(rawEncryptionKey);
  return { clientId, clientSecret, redirectUri: callback.toString() };
}

function getEncryptionKey(): Buffer {
  const value = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new GoogleCalendarOAuthError("configuration_missing");
  try {
    return parseGoogleCalendarEncryptionKey(value);
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }
}

function getGoogleFetch(): typeof fetch {
  return fetchOverride ?? fetch;
}

function getCalendarId(): string {
  const value = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }
  return value;
}

function encryptSecret(value: string): EncryptedSecret {
  return encryptGoogleCalendarSecret(value, getEncryptionKey());
}

function decryptSecret(value: EncryptedSecret): string {
  return decryptGoogleCalendarSecret(value, getEncryptionKey());
}

function oauthTokenErrorCode(payload: OAuthTokenResponse): string | null {
  return typeof payload.error === "string" ? payload.error : null;
}

async function parseTokenResponse(
  response: Response,
): Promise<OAuthTokenResponse> {
  try {
    return (await response.json()) as OAuthTokenResponse;
  } catch {
    return {};
  }
}

function getAccessTokenExpiry(expiresIn: unknown): number {
  const parsed = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  const safeSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
  return (
    Date.now() + Math.max(30, safeSeconds - TOKEN_REFRESH_SKEW_SECONDS) * 1000
  );
}

async function refreshGoogleCalendarAccessToken(
  integration: typeof googleCalendarIntegrationTable.$inferSelect,
): Promise<CachedAccessToken> {
  let config: GoogleCalendarOAuthClientConfig;
  try {
    config = getClientConfig();
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }
  const refreshToken = decryptSecret({
    ciphertext: integration.refreshTokenCiphertext,
    iv: integration.refreshTokenIv,
    authTag: integration.refreshTokenAuthTag,
  });

  let response: Response;
  try {
    response = await getGoogleFetch()(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(MAX_GOOGLE_REQUEST_MS),
    });
  } catch {
    throw new GoogleCalendarOAuthError("token_request_failed");
  }

  const payload = await parseTokenResponse(response);
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    !payload.access_token
  ) {
    if (oauthTokenErrorCode(payload) === "invalid_grant") {
      await db
        .update(googleCalendarIntegrationTable)
        .set({ status: "reauthorization_required", updatedAt: new Date() })
        .where(
          eq(googleCalendarIntegrationTable.id, GOOGLE_CALENDAR_INTEGRATION_ID),
        );
      cachedAccessToken = null;
      throw new GoogleCalendarOAuthError("reauthorization_required");
    }
    throw new GoogleCalendarOAuthError("token_request_failed");
  }

  let integrationUpdatedAt = integration.updatedAt.getTime();
  if (typeof payload.refresh_token === "string" && payload.refresh_token) {
    const replacement = encryptSecret(payload.refresh_token);
    const updatedAt = new Date();
    await db
      .update(googleCalendarIntegrationTable)
      .set({
        refreshTokenCiphertext: replacement.ciphertext,
        refreshTokenIv: replacement.iv,
        refreshTokenAuthTag: replacement.authTag,
        encryptionVersion: 1,
        status: "connected",
        updatedAt,
      })
      .where(
        eq(googleCalendarIntegrationTable.id, GOOGLE_CALENDAR_INTEGRATION_ID),
      );
    integrationUpdatedAt = updatedAt.getTime();
  }

  return {
    accessToken: payload.access_token,
    expiresAt: getAccessTokenExpiry(payload.expires_in),
    integrationUpdatedAt,
  };
}

async function getGoogleCalendarAccessToken(): Promise<string> {
  try {
    getClientConfig();
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }

  const [integration] = await db
    .select()
    .from(googleCalendarIntegrationTable)
    .where(
      eq(googleCalendarIntegrationTable.id, GOOGLE_CALENDAR_INTEGRATION_ID),
    )
    .limit(1);
  if (!integration) throw new GoogleCalendarOAuthError("not_connected");
  if (integration.status !== "connected") {
    throw new GoogleCalendarOAuthError("reauthorization_required");
  }

  const integrationUpdatedAt = integration.updatedAt.getTime();
  if (
    cachedAccessToken &&
    cachedAccessToken.integrationUpdatedAt === integrationUpdatedAt &&
    cachedAccessToken.expiresAt > Date.now()
  ) {
    return cachedAccessToken.accessToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshGoogleCalendarAccessToken(integration);
  }
  try {
    cachedAccessToken = await refreshInFlight;
    return cachedAccessToken.accessToken;
  } finally {
    refreshInFlight = null;
  }
}

export function getGoogleCalendarId(): string {
  return getCalendarId();
}

export async function getGoogleCalendarOAuthStatus(): Promise<{
  configured: boolean;
  missingConfiguration: string[];
  status: "not_connected" | "connected" | "reauthorization_required";
  connectedAt: string | null;
  calendarId: string;
}> {
  const required = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
  ];
  const missingConfiguration = required.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim()) {
    try {
      parseGoogleCalendarEncryptionKey(
        process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY,
      );
    } catch {
      missingConfiguration.push(
        "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY (inválida)",
      );
    }
  }
  if (process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()) {
    try {
      const redirect = new URL(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
      if (
        redirect.pathname !== "/api/calendar/google/callback" ||
        redirect.search ||
        redirect.hash ||
        (process.env.NODE_ENV === "production" &&
          redirect.protocol !== "https:")
      ) {
        missingConfiguration.push("GOOGLE_CALENDAR_REDIRECT_URI (inválida)");
      }
    } catch {
      missingConfiguration.push("GOOGLE_CALENDAR_REDIRECT_URI (inválida)");
    }
  }

  const [integration] = await db
    .select({
      status: googleCalendarIntegrationTable.status,
      connectedAt: googleCalendarIntegrationTable.connectedAt,
    })
    .from(googleCalendarIntegrationTable)
    .where(
      eq(googleCalendarIntegrationTable.id, GOOGLE_CALENDAR_INTEGRATION_ID),
    )
    .limit(1);

  const status =
    integration?.status === "connected" ||
    integration?.status === "reauthorization_required"
      ? integration.status
      : "not_connected";
  return {
    configured: missingConfiguration.length === 0,
    missingConfiguration: [...new Set(missingConfiguration)],
    status,
    connectedAt: integration?.connectedAt.toISOString() ?? null,
    calendarId: getCalendarId(),
  };
}

export async function beginGoogleCalendarOAuth(userId: number): Promise<{
  authorizationUrl: string;
  state: string;
}> {
  let config: GoogleCalendarOAuthClientConfig;
  try {
    config = getClientConfig();
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }
  const state = randomBytes(32).toString("base64url");
  const pkce = createGoogleCalendarPkcePair();
  const verifier = encryptSecret(pkce.verifier);
  const createdAt = new Date();

  await db
    .delete(googleCalendarOAuthStatesTable)
    .where(lt(googleCalendarOAuthStatesTable.expiresAt, createdAt));
  await db.insert(googleCalendarOAuthStatesTable).values({
    stateHash: hashGoogleCalendarOAuthState(state),
    codeVerifierCiphertext: verifier.ciphertext,
    codeVerifierIv: verifier.iv,
    codeVerifierAuthTag: verifier.authTag,
    startedByUserId: userId,
    expiresAt: new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS),
  });

  return {
    state,
    authorizationUrl: createGoogleCalendarAuthorizationUrl({
      config,
      state,
      codeChallenge: pkce.challenge,
    }),
  };
}

export async function consumeGoogleCalendarOAuthState(state: string): Promise<{
  userId: number;
  codeVerifier: string;
} | null> {
  const [attempt] = await db
    .delete(googleCalendarOAuthStatesTable)
    .where(
      and(
        eq(
          googleCalendarOAuthStatesTable.stateHash,
          hashGoogleCalendarOAuthState(state),
        ),
        gt(googleCalendarOAuthStatesTable.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!attempt) return null;

  const codeVerifier = decryptSecret({
    ciphertext: attempt.codeVerifierCiphertext,
    iv: attempt.codeVerifierIv,
    authTag: attempt.codeVerifierAuthTag,
  });
  return { userId: attempt.startedByUserId, codeVerifier };
}

export async function isGoogleCalendarAdminStillAuthorized(
  userId: number,
): Promise<boolean> {
  const [user] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .innerJoin(
      authRolePermissionsTable,
      eq(authRolePermissionsTable.role, authUsersTable.role),
    )
    .innerJoin(
      authPermissionsTable,
      eq(authPermissionsTable.id, authRolePermissionsTable.permissionId),
    )
    .where(
      and(
        eq(authUsersTable.id, userId),
        eq(authUsersTable.isActive, true),
        eq(authPermissionsTable.key, "rbac:manage"),
      ),
    )
    .limit(1);
  return Boolean(user);
}

export async function completeGoogleCalendarOAuth(input: {
  code: string;
  codeVerifier: string;
  userId: number;
}): Promise<void> {
  let config: GoogleCalendarOAuthClientConfig;
  try {
    config = getClientConfig();
  } catch {
    throw new GoogleCalendarOAuthError("configuration_missing");
  }

  let response: Response;
  try {
    response = await getGoogleFetch()(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(MAX_GOOGLE_REQUEST_MS),
    });
  } catch {
    throw new GoogleCalendarOAuthError("authorization_failed");
  }

  const payload = await parseTokenResponse(response);
  if (
    !response.ok ||
    typeof payload.access_token !== "string" ||
    !payload.access_token ||
    (typeof payload.scope === "string" &&
      !payload.scope
        .split(/\s+/)
        .includes("https://www.googleapis.com/auth/calendar.events.owned"))
  ) {
    throw new GoogleCalendarOAuthError("authorization_failed");
  }

  let refreshToken =
    typeof payload.refresh_token === "string" && payload.refresh_token
      ? payload.refresh_token
      : null;
  if (!refreshToken) {
    const [existing] = await db
      .select()
      .from(googleCalendarIntegrationTable)
      .where(
        eq(googleCalendarIntegrationTable.id, GOOGLE_CALENDAR_INTEGRATION_ID),
      )
      .limit(1);
    if (existing) {
      refreshToken = decryptSecret({
        ciphertext: existing.refreshTokenCiphertext,
        iv: existing.refreshTokenIv,
        authTag: existing.refreshTokenAuthTag,
      });
    }
  }
  if (!refreshToken) throw new GoogleCalendarOAuthError("authorization_failed");

  const encryptedToken = encryptSecret(refreshToken);
  await db
    .insert(googleCalendarIntegrationTable)
    .values({
      id: GOOGLE_CALENDAR_INTEGRATION_ID,
      refreshTokenCiphertext: encryptedToken.ciphertext,
      refreshTokenIv: encryptedToken.iv,
      refreshTokenAuthTag: encryptedToken.authTag,
      encryptionVersion: 1,
      status: "connected",
      connectedByUserId: input.userId,
      connectedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: googleCalendarIntegrationTable.id,
      set: {
        refreshTokenCiphertext: encryptedToken.ciphertext,
        refreshTokenIv: encryptedToken.iv,
        refreshTokenAuthTag: encryptedToken.authTag,
        encryptionVersion: 1,
        status: "connected",
        connectedByUserId: input.userId,
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  cachedAccessToken = null;
}

async function defaultGoogleCalendarRequest(
  path: string,
  init?: CalendarRequestInit,
): Promise<Response> {
  if (!path.startsWith("/calendar/v3/")) {
    throw new Error("Invalid Google Calendar API path.");
  }
  const url = new URL(path, GOOGLE_API_BASE_URL);
  if (url.origin !== GOOGLE_API_BASE_URL) {
    throw new Error("Invalid Google Calendar API origin.");
  }
  const fetchWithToken = (accessToken: string) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return getGoogleFetch()(url, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(MAX_GOOGLE_REQUEST_MS),
    });
  };
  const accessToken = await getGoogleCalendarAccessToken();
  const response = await fetchWithToken(accessToken);
  if (response.status !== 401) return response;

  cachedAccessToken = null;
  const refreshedAccessToken = await getGoogleCalendarAccessToken();
  return fetchWithToken(refreshedAccessToken);
}

let requestGoogleCalendar: GoogleCalendarRequest = defaultGoogleCalendarRequest;

export function googleCalendarRequest(
  path: string,
  init?: CalendarRequestInit,
): Promise<Response> {
  return requestGoogleCalendar(path, init);
}

export function setGoogleCalendarRequestForTests(
  request: GoogleCalendarRequest | null,
): void {
  requestOverride = request;
  requestGoogleCalendar = request ?? defaultGoogleCalendarRequest;
}

export function setGoogleCalendarFetchForTests(
  fetchFunction: typeof fetch | null,
): void {
  fetchOverride = fetchFunction;
}
