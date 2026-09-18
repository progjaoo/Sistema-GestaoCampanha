import { createSign } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";

const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FALLBACK_SPREADSHEET_ID = "1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI";

const connectors = new ReplitConnectors();

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type CachedAccessToken = {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

type GoogleSheetsRequest = (path: string) => Promise<Response>;

let cachedAccessToken: CachedAccessToken | null = null;
let requestOverride: GoogleSheetsRequest | null = null;

export const CAMPAIGN_SPREADSHEET_ID = FALLBACK_SPREADSHEET_ID;

export function parseSpreadsheetId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9-_]+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    return match?.[1] && /^[A-Za-z0-9-_]+$/.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

export function getConfiguredSpreadsheetId(): string {
  const configuredValue =
    process.env.GOOGLE_SHEETS_SPREADSHEET_URL?.trim() ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : FALLBACK_SPREADSHEET_ID);
  const spreadsheetId = parseSpreadsheetId(configuredValue);
  if (!spreadsheetId) {
    throw new Error(
      "GOOGLE_SHEETS_SPREADSHEET_URL ou GOOGLE_SHEETS_SPREADSHEET_ID deve conter uma URL ou ID válido",
    );
  }
  return spreadsheetId;
}

function getServiceAccount(): ServiceAccount | null {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawCredentials) return null;

  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(rawCredentials) as Partial<ServiceAccount>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON deve conter um JSON válido");
  }

  const clientEmail = parsed.client_email?.trim();
  const privateKey = parsed.private_key?.replace(/\\n/g, "\n").trim();
  const tokenUri = parsed.token_uri?.trim() || DEFAULT_TOKEN_URI;
  if (!clientEmail || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON deve conter client_email e private_key",
    );
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: tokenUri,
  };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function getServiceAccountAccessToken(
  account: ServiceAccount,
): Promise<string> {
  const cacheKey = `${account.client_email}:${account.private_key}`;
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedAccessToken?.cacheKey === cacheKey &&
    cachedAccessToken.expiresAt - 60 > now
  ) {
    return cachedAccessToken.accessToken;
  }

  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: READ_ONLY_SCOPE,
      aud: account.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(account.private_key, "base64url");

  const tokenResponse = await fetch(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `Google OAuth rejeitou a conta de serviço (${tokenResponse.status})`,
    );
  }

  const tokenBody = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenBody.access_token) {
    throw new Error("Google OAuth não retornou um access token");
  }

  const expiresIn = Number.isFinite(tokenBody.expires_in)
    ? Number(tokenBody.expires_in)
    : 3600;
  cachedAccessToken = {
    cacheKey,
    accessToken: tokenBody.access_token,
    expiresAt: now + Math.max(60, expiresIn),
  };
  return tokenBody.access_token;
}

async function nativeGoogleSheetsRequest(path: string): Promise<Response> {
  const account = getServiceAccount();
  if (!account) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON deve ser configurado para ler o Google Sheets em produção",
    );
  }
  const accessToken = await getServiceAccountAccessToken(account);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${GOOGLE_SHEETS_API_BASE_URL}${normalizedPath}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function publicGoogleSheetsRequest(
  path: string,
  apiKey: string,
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, GOOGLE_SHEETS_API_BASE_URL);
  url.searchParams.set("key", apiKey);
  return fetch(url, { method: "GET" });
}

export async function googleSheetsRequest(path: string): Promise<Response> {
  if (requestOverride) return requestOverride(path);

  if (getServiceAccount()) return nativeGoogleSheetsRequest(path);
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  if (apiKey) return publicGoogleSheetsRequest(path, apiKey);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Configure GOOGLE_SHEETS_API_KEY para uma planilha pública ou GOOGLE_SERVICE_ACCOUNT_JSON para uma planilha restrita",
    );
  }
  return connectors.proxy("google-sheet", path, { method: "GET" });
}

export function setGoogleSheetsRequestForTests(
  override: GoogleSheetsRequest | null,
): void {
  requestOverride = override;
}

export function resetGoogleSheetsForTests(): void {
  requestOverride = null;
  cachedAccessToken = null;
}

